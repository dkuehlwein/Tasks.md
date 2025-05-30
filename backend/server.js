const fs = require("fs");
const uuid = require("uuid");
const Koa = require("koa");
const app = new Koa();
const router = require("@koa/router")();
const bodyParser = require("koa-bodyparser");
const cors = require("@koa/cors");
const multer = require("@koa/multer");
const mount = require("koa-mount");
const serve = require("koa-static");

// Import our modular components
const taskOps = require("./lib/task-operations");
const MCPHttpHandler = require("./lib/mcp-http-handler");

const PUID = Number(process.env.PUID);
const PGID = Number(process.env.PGID);
const BASE_PATH =
  process.env.BASE_PATH.at(-1) === "/"
    ? process.env.BASE_PATH
    : `${process.env.BASE_PATH}/`;

const multerInstance = multer();

// Initialize MCP handler
const mcpHandler = new MCPHttpHandler();

// Web API utility functions (using shared task operations where possible)
async function getTags(ctx) {
  const files = await taskOps.getMdFiles();
  const filesContents = await Promise.all(
    files.map((file) =>
      taskOps.getContent(`${process.env.TASKS_DIR}/${file.lane}/${file.name}`)
    )
  );
  const usedTagsTexts = filesContents
    .map((content) => taskOps.getTagsTextsFromCardContent(content))
    .flat()
    .sort((a, b) => a.localeCompare(b));
  const usedTagsTextsWithoutDuplicates = Array.from(
    new Set(usedTagsTexts.map((tagText) => tagText.toLowerCase()))
  );
  const allTags = await fs.promises
    .readFile(`${process.env.CONFIG_DIR}/tags.json`)
    .then((res) => JSON.parse(res.toString()))
    .catch((err) => []);
  const usedTags = usedTagsTextsWithoutDuplicates.map(
    (tag) =>
      allTags.find((tagToFind) => tagToFind.name.toLowerCase() === tag) || {
        name: tag,
        backgroundColor: "var(--color-alt-1)",
      }
  );
  ctx.body = { all: allTags, used: usedTags };
}

async function putTags(ctx) {
  const newTags = JSON.stringify(ctx.request.body || []);
  await fs.promises.mkdir(`${process.env.CONFIG_DIR}`, { recursive: true });
  await fs.promises.writeFile(`${process.env.CONFIG_DIR}/tags.json`, newTags);
  await fs.promises.chown(`${process.env.CONFIG_DIR}/tags.json`, PUID, PGID);
  ctx.status = 200;
}

async function getCards(ctx) {
  const cards = await taskOps.getCards();
  ctx.body = cards;
}

async function getLanes(ctx) {
  try {
    const lanes = await taskOps.getLanesNames();
    const lanesSort = await fs.promises
      .readFile(`${process.env.CONFIG_DIR}/sort/lanes.json`)
      .then((res) => JSON.parse(res.toString()))
      .catch((err) => []);
    const lanesWithSort = lanesSort
      .filter((laneFromSort) => lanes.includes(laneFromSort))
      .concat(lanes.filter((lane) => !lanesSort.includes(lane)));
    ctx.body = lanesWithSort;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
}

async function getLaneCards(ctx) {
  const lane = ctx.params.lane;
  const cards = await taskOps.getCards();
  const laneCards = cards.filter((card) => card.lane === lane);
  const cardsSort = await fs.promises
    .readFile(`${process.env.CONFIG_DIR}/sort/cards.json`)
    .then((res) => JSON.parse(res.toString()))
    .catch((err) => ({}));
  const laneCardsSort = cardsSort[lane] || [];
  const laneCardsWithSort = laneCardsSort
    .filter((cardFromSort) =>
      laneCards.find((card) => card.name === cardFromSort)
    )
    .map((cardFromSort) =>
      laneCards.find((card) => card.name === cardFromSort)
    )
    .concat(
      laneCards.filter(
        (card) => !laneCardsSort.find((cardFromSort) => cardFromSort === card.name)
      )
    );
  ctx.body = laneCardsWithSort;
}

async function getCard(ctx) {
  const lane = ctx.params.lane;
  const name = ctx.params.name;
  const content = await taskOps.getContent(
    `${process.env.TASKS_DIR}/${lane}/${name}.md`
  );
  ctx.body = { content };
}

async function updateCard(ctx) {
  const lane = ctx.params.lane;
  const name = ctx.params.name;
  const content = ctx.request.body.content;
  await fs.promises.writeFile(
    `${process.env.TASKS_DIR}/${lane}/${name}.md`,
    content
  );
  await fs.promises.chown(
    `${process.env.TASKS_DIR}/${lane}/${name}.md`,
    PUID,
    PGID
  );
  ctx.status = 204;
}

async function createCard(ctx) {
  const lane = ctx.request.body.lane;
  const name = uuid.v4();
  await fs.promises.writeFile(
    `${process.env.TASKS_DIR}/${lane}/${name}.md`,
    ""
  );
  await fs.promises.chown(
    `${process.env.TASKS_DIR}/${lane}/${name}.md`,
    PUID,
    PGID
  );
  ctx.body = name;
  ctx.status = 201;
}

async function deleteCard(ctx) {
  const lane = ctx.params.lane;
  const name = ctx.params.name;
  await fs.promises.rm(`${process.env.TASKS_DIR}/${lane}/${name}.md`);
  ctx.status = 204;
}

async function moveCard(ctx) {
  const lane = ctx.params.lane;
  const name = ctx.params.name;
  const newLane = ctx.request.body.lane;
  const content = await taskOps.getContent(
    `${process.env.TASKS_DIR}/${lane}/${name}.md`
  );
  await fs.promises.mkdir(`${process.env.TASKS_DIR}/${newLane}`, {
    recursive: true,
  });
  await fs.promises.chown(`${process.env.TASKS_DIR}/${newLane}`, PUID, PGID);
  await fs.promises.writeFile(
    `${process.env.TASKS_DIR}/${newLane}/${name}.md`,
    content
  );
  await fs.promises.chown(
    `${process.env.TASKS_DIR}/${newLane}/${name}.md`,
    PUID,
    PGID
  );
  await fs.promises.rm(`${process.env.TASKS_DIR}/${lane}/${name}.md`);
  ctx.status = 204;
}

async function createLane(ctx) {
  const lane = uuid.v4();
  await fs.promises.mkdir(`${process.env.TASKS_DIR}/${lane}`);
  await fs.promises.chown(`${process.env.TASKS_DIR}/${lane}`, PUID, PGID);
  ctx.body = lane;
  ctx.status = 201;
}

async function deleteLane(ctx) {
  const lane = ctx.params.lane;
  await fs.promises.rm(`${process.env.TASKS_DIR}/${lane}`, {
    recursive: true,
  });
  ctx.status = 204;
}

async function renameLane(ctx) {
  const lane = ctx.params.lane;
  const newName = ctx.request.body.name;
  await fs.promises.rename(
    `${process.env.TASKS_DIR}/${lane}`,
    `${process.env.TASKS_DIR}/${newName}`
  );
  ctx.status = 204;
}

async function saveLanesSort(ctx) {
  const newSort = JSON.stringify(ctx.request.body || []);
  await fs.promises.mkdir(`${process.env.CONFIG_DIR}/sort`, {
    recursive: true,
  });
  await fs.promises.writeFile(
    `${process.env.CONFIG_DIR}/sort/lanes.json`,
    newSort
  );
  await fs.promises.chown(
    `${process.env.CONFIG_DIR}/sort/lanes.json`,
    PUID,
    PGID
  );
  ctx.status = 200;
}

async function saveCardsSort(ctx) {
  const newSort = JSON.stringify(ctx.request.body || []);
  await fs.promises.mkdir(`${process.env.CONFIG_DIR}/sort`, {
    recursive: true,
  });
  await fs.promises.writeFile(
    `${process.env.CONFIG_DIR}/sort/cards.json`,
    newSort
  );
  await fs.promises.chown(
    `${process.env.CONFIG_DIR}/sort/cards.json`,
    PUID,
    PGID
  );
  ctx.status = 200;
}

async function saveImage(ctx) {
  const imageName = ctx.request.file.originalname;
  await fs.promises.mkdir(`${process.env.CONFIG_DIR}/images`, {
    recursive: true,
  });
  await fs.promises.writeFile(
    `${process.env.CONFIG_DIR}/images/${imageName}`,
    ctx.request.file.buffer
  );
  await fs.promises.chown(
    `${process.env.CONFIG_DIR}/images/${imageName}`,
    PUID,
    PGID
  );
  ctx.status = 204;
}

// Set up middleware
app.use(bodyParser());
app.use(cors());

// Set up routes
router.get("/tags", getTags);
router.put("/tags", putTags);
router.get("/cards", getCards);
router.get("/lanes", getLanes);
router.get("/lanes/:lane/cards", getLaneCards);
router.get("/lanes/:lane/cards/:name", getCard);
router.put("/lanes/:lane/cards/:name", updateCard);
router.post("/cards", createCard);
router.delete("/lanes/:lane/cards/:name", deleteCard);
router.patch("/lanes/:lane/cards/:name", moveCard);
router.post("/lanes", createLane);
router.delete("/lanes/:lane", deleteLane);
router.patch("/lanes/:lane", renameLane);
router.put("/lanes/sort", saveLanesSort);
router.put("/cards/sort", saveCardsSort);
router.post("/images", multerInstance.single("image"), saveImage);

// Mount routes and static files
app.use(mount(`${BASE_PATH}api`, router.routes()));
app.use(mount(BASE_PATH, serve("/static")));
app.use(mount(`${BASE_PATH}api/images`, serve(`${process.env.CONFIG_DIR}/images`)));
app.use(
  mount(
    `${BASE_PATH}stylesheets/`,
    serve(`${process.env.CONFIG_DIR}/stylesheets`)
  )
);

// Cleanup function for unused images
async function removeUnusedImages() {
  const files = await taskOps.getMdFiles();
  const filesContents = await Promise.all(
    files.map(async (file) =>
      taskOps.getContent(`${process.env.TASKS_DIR}/${file.lane}/${file.name}`)
    )
  );
  const imagesBeingUsed = filesContents
    .map((content) => content.match(/!\[[^\]]*\]\(([^\s]+[.]*)\)/g))
    .flat()
    .filter((image) => !!image && image.includes("/api/images/"))
    .map((image) => image.split("/api/images/")[1].slice(0, -1));
  const allImages = await fs.promises.readdir(
    `${process.env.CONFIG_DIR}/images`
  );
  const unusedImages = allImages.filter(
    (image) => !imagesBeingUsed.includes(image)
  );
  await Promise.all(
    unusedImages.map((image) =>
      fs.promises.rm(`${process.env.CONFIG_DIR}/images/${image}`)
    )
  );
}

// Set up image cleanup interval
if (process.env.LOCAL_IMAGES_CLEANUP_INTERVAL) {
  const intervalInMs = process.env.LOCAL_IMAGES_CLEANUP_INTERVAL * 60000;
  try {
    if (intervalInMs > 0) {
      setInterval(removeUnusedImages, intervalInMs);
    }
  } catch (error) {
    console.error(error);
  }
}

// MCP endpoint handler
app.use(async (ctx, next) => {
  if (ctx.path === '/mcp' && ctx.method === 'POST') {
    await mcpHandler.handleRequest(ctx);
    return;
  }
  await next();
});

// Initialize MCP server on startup
mcpHandler.initialize().then(() => {
  console.log(`🚀 Tasks.md MCP server initialized and ready`);
  console.log(`📡 MCP endpoint available at: http://localhost:${process.env.PORT}/mcp`);
}).catch(error => {
  console.error("❌ Failed to initialize MCP server:", error);
});

app.listen(process.env.PORT);