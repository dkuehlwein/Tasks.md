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
const configOps = require("./lib/config-operations");
const MCPHttpHandler = require("./lib/mcp-http-handler");

const BASE_PATH =
  process.env.BASE_PATH.at(-1) === "/"
    ? process.env.BASE_PATH
    : `${process.env.BASE_PATH}/`;

const multerInstance = multer();

// Initialize MCP handler
const mcpHandler = new MCPHttpHandler();

// Web API utility functions (now using shared operations)
async function getTags(ctx) {
  const tags = await configOps.getTags();
  ctx.body = tags;
}

async function putTags(ctx) {
  await configOps.saveTags(ctx.request.body);
  ctx.status = 200;
}

async function getCards(ctx) {
  const cards = await taskOps.getCards();
  ctx.body = cards;
}

async function getLanes(ctx) {
  try {
    const lanes = await taskOps.getLanesNames();
    const lanesSort = await configOps.getLanesSort();
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
  const cardsSort = await configOps.getCardsSort();
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
  try {
    const lane = ctx.params.lane;
    const name = ctx.params.name;
    const content = ctx.request.body.content;
    await taskOps.updateTask(name, { lane, content });
    ctx.status = 204;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
}

async function renameCard(ctx) {
  try {
    const lane = ctx.params.lane;
    const oldName = ctx.params.name;
    const newName = ctx.request.body.name;
    await taskOps.renameTask(oldName, newName, lane);
    ctx.status = 204;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
}

async function createCard(ctx) {
  try {
    const lane = ctx.request.body.lane;
    const result = await taskOps.createTask(lane, "", "");
    ctx.body = result.id;
    ctx.status = 201;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
}

async function deleteCard(ctx) {
  try {
    const lane = ctx.params.lane;
    const name = ctx.params.name;
    await taskOps.deleteTask(name, lane);
    ctx.status = 204;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
}

async function moveCard(ctx) {
  try {
    const lane = ctx.params.lane;
    const name = ctx.params.name;
    const newLane = ctx.request.body.lane;
    await taskOps.moveTask(name, lane, newLane);
    ctx.status = 204;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
}

async function createLane(ctx) {
  try {
    const result = await taskOps.createLane();
    ctx.body = result.id;
    ctx.status = 201;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
}

async function deleteLane(ctx) {
  try {
    const lane = ctx.params.lane;
    await taskOps.deleteLane(lane);
    ctx.status = 204;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
}

async function renameLane(ctx) {
  try {
    const lane = ctx.params.lane;
    const newName = ctx.request.body.name;
    await taskOps.renameLane(lane, newName);
    ctx.status = 204;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
}

async function saveLanesSort(ctx) {
  try {
    await configOps.saveLanesSort(ctx.request.body);
    ctx.status = 200;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
}

async function saveCardsSort(ctx) {
  try {
    await configOps.saveCardsSort(ctx.request.body);
    ctx.status = 200;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
}

async function saveImage(ctx) {
  try {
    const imageName = ctx.request.file.originalname;
    await configOps.saveImage(imageName, ctx.request.file.buffer);
    ctx.status = 204;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { error: error.message };
  }
}

async function getTitle(ctx) {
  const title = await configOps.getTitle();
  ctx.body = title;
}

async function getLanesSort(ctx) {
  const lanesSort = await configOps.getLanesSort();
  ctx.body = lanesSort;
}

async function getCardsSort(ctx) {
  const cardsSort = await configOps.getCardsSort();
  ctx.body = cardsSort;
}

// Set up middleware
app.use(bodyParser());
app.use(cors());

// Set up routes
router.get("/title", getTitle);
router.get("/tags", getTags);
router.put("/tags", putTags);
router.get("/cards", getCards);
router.get("/lanes", getLanes);
router.get("/sort/lanes", getLanesSort);
router.get("/sort/cards", getCardsSort);
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
router.patch("/lanes/:lane/cards/:name/rename", renameCard);

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

// Set up image cleanup interval
if (process.env.LOCAL_IMAGES_CLEANUP_INTERVAL) {
  const intervalInMs = process.env.LOCAL_IMAGES_CLEANUP_INTERVAL * 60000;
  try {
    if (intervalInMs > 0) {
      setInterval(configOps.removeUnusedImages, intervalInMs);
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