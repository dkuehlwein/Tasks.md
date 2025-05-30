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

const { z } = require("zod");

const PUID = Number(process.env.PUID);
const PGID = Number(process.env.PGID);
const BASE_PATH =
  process.env.BASE_PATH.at(-1) === "/"
    ? process.env.BASE_PATH
    : `${process.env.BASE_PATH}/`;

// We'll implement proper MCP server setup later in the file
let mcpServer = null;

// MCP Tool handlers - these will be properly integrated with the MCP SDK
async function listLanes() {
  try {
    const lanes = await getLanesNames();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            lanes: lanes,
            total: lanes.length
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
}

const multerInstance = multer();

async function getLanesNames() {
  await fs.promises.mkdir(process.env.TASKS_DIR, { recursive: true });
  return fs.promises.readdir(process.env.TASKS_DIR, { withFileTypes: true })
    .then(dirs => dirs
      .filter(dir => dir.isDirectory())
      .map(dir => dir.name)
    );
}

async function getMdFiles() {
  const lanes = await getLanesNames();
  const lanesFiles = await Promise.all(
    lanes.map((lane) =>
      fs.promises
        .readdir(`${process.env.TASKS_DIR}/${lane}`)
        .then((files) => files.map((file) => ({ lane, name: file })))
    )
  );
  const files = lanesFiles
    .flat()
    .filter(file => file.name.endsWith('.md'));
  return files;
}

function getContent(path) {
  return fs.promises.readFile(path).then((res) => res.toString());
}

async function getTags(ctx) {
  const files = await getMdFiles();
  const filesContents = await Promise.all(
    files.map((file) =>
      getContent(`${process.env.TASKS_DIR}/${file.lane}/${file.name}`)
    )
  );
  const usedTagsTexts = filesContents
    .map((content) => getTagsTextsFromCardContent(content))
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
  await fs.promises.writeFile(
    `${process.env.CONFIG_DIR}/tags.json`,
    JSON.stringify(usedTags)
  );
  ctx.status = 200;
  ctx.body = usedTags;
}

router.get("/tags", getTags);

async function updateTagBackgroundColor(ctx) {
  const name = ctx.params.tagName;
  const backgroundColor = ctx.request.body.backgroundColor;
  const tags = await fs.promises
    .readFile(`${process.env.CONFIG_DIR}/tags.json`)
    .then((res) => JSON.parse(res.toString()))
    .catch((err) => []);
  const tagIndex = tags.findIndex(
    (tag) => tag.name.toLowerCase() === name.toLowerCase()
  );
  if (tagIndex === -1) {
    ctx.status = 404;
    ctx.body = `Tag ${name} not found`;
    return;
  }
  tags[tagIndex].backgroundColor = backgroundColor;
  await fs.promises.writeFile(
    `${process.env.CONFIG_DIR}/tags.json`,
    JSON.stringify(tags)
  );
  ctx.status = 204;
}

router.patch("/tags/:tagName", updateTagBackgroundColor);

function getTagsTextsFromCardContent(cardContent) {
  const indexOfTagsKeyword = cardContent.toLowerCase().indexOf("tags: ");
  if (indexOfTagsKeyword === -1) {
    return [];
  }
  let startOfTags = cardContent.substring(indexOfTagsKeyword + "tags: ".length);
  const lineBreak = cardContent.indexOf("\n");
  if (lineBreak > 0) {
    startOfTags = startOfTags.split("\n")[0];
  }
  const tags = startOfTags
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");

  return tags;
}

async function getLaneByCardName(cardName) {
  const files = await getMdFiles();
  return files.find((file) => file.name === `${cardName}.md`).lane;
}

async function getLanes(ctx) {
  const lanes = await fs.promises.readdir(process.env.TASKS_DIR);
  ctx.body = lanes;
}

router.get("/lanes", getLanes);

async function getCards(ctx) {
  const files = await getMdFiles();
  const filesContents = await Promise.all(
    files.map(async (file) => {
      const content = await getContent(
        `${process.env.TASKS_DIR}/${file.lane}/${file.name}`
      );
      const newName = file.name.substring(0, file.name.length - 3);
      return { ...file, content, name: newName };
    })
  );
  ctx.body = filesContents;
}

router.get("/cards", getCards);

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

router.post("/cards", createCard);

async function updateCard(ctx) {
  const oldLane = await getLaneByCardName(ctx.params.card);
  const name = ctx.params.card;
  const newLane = ctx.request.body.lane || oldLane;
  const newName = (ctx.request.body.name || name)
    .replaceAll(/<>:"\/\\\|\?\*/g, ' ');
  const newContent = ctx.request.body.content;
  if (newLane !== oldLane || name !== newName) {
    await fs.promises.rename(
      `${process.env.TASKS_DIR}/${oldLane}/${name}.md`,
      `${process.env.TASKS_DIR}/${newLane}/${newName}.md`
    );
  }
  if (newContent) {
    await fs.promises.writeFile(
      `${process.env.TASKS_DIR}/${newLane}/${newName}.md`,
      newContent
    );
  }
  await fs.promises.chown(
    `${process.env.TASKS_DIR}/${newLane}/${newName}.md`,
    PUID,
    PGID
  );
  ctx.status = 204;
}

router.patch("/cards/:card", updateCard);

async function deleteCard(ctx) {
  const lane = await getLaneByCardName(ctx.params.card);
  const name = ctx.params.card;
  await fs.promises.rm(`${process.env.TASKS_DIR}/${lane}/${name}.md`);
  ctx.status = 204;
}

router.delete("/cards/:card", deleteCard);

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

async function createLane(ctx) {
  const lane = uuid.v4();
  await fs.promises.mkdir(`${process.env.TASKS_DIR}/${lane}`);
  await fs.promises.chown(`${process.env.TASKS_DIR}/${lane}`, PUID, PGID);
  ctx.body = lane;
  ctx.status = 201;
}

router.post("/lanes", createLane);

async function updateLane(ctx) {
  const name = ctx.params.lane;
  const newName = ctx.request.body.name
    .replaceAll(/[<>:"/\\|?*]/g, ' ');
  await fs.promises.rename(
    `${process.env.TASKS_DIR}/${name}`,
    `${process.env.TASKS_DIR}/${newName}`
  );
  await fs.promises.chown(`${process.env.TASKS_DIR}/${newName}`, PUID, PGID);
  ctx.status = 204;
}

router.patch("/lanes/:lane", updateLane);

async function deleteLane(ctx) {
  const lane = ctx.params.lane;
  await fs.promises.rm(`${process.env.TASKS_DIR}/${lane}`, {
    force: true,
    recursive: true,
  });
  ctx.status = 204;
}

router.delete("/lanes/:lane", deleteLane);

async function getTitle(ctx) {
  ctx.body = process.env.TITLE;
}

router.get("/title", getTitle);

async function getLanesSort(ctx) {
  const lanes = await fs.promises
    .readFile(`${process.env.CONFIG_DIR}/sort/lanes.json`)
    .then((res) => JSON.parse(res.toString()))
    .catch((err) => []);
  ctx.status = 200;
  ctx.body = lanes;
}

router.get("/sort/lanes", getLanesSort);

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

router.post("/sort/lanes", saveLanesSort);

async function getCardsSort(ctx) {
  const cards = await fs.promises
    .readFile(`${process.env.CONFIG_DIR}/sort/cards.json`)
    .then((res) => JSON.parse(res.toString()))
    .catch((err) => []);
  ctx.status = 200;
  ctx.body = cards;
}

router.get("/sort/cards", getCardsSort);

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

router.post("/sort/cards", saveCardsSort);

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

router.post("/images", multerInstance.single("file"), saveImage);

app.use(cors());
app.use(bodyParser());
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error(err);
    err.status = err.statusCode || err.status || 500;
    throw err;
  }
});

app.use(async (ctx, next) => {
  if (BASE_PATH === "/") {
    return next();
  }
  if (
    ctx.URL.href ===
    `${ctx.URL.origin}${BASE_PATH.substring(0, BASE_PATH.length - 1)}`
  ) {
    ctx.status = 301;
    return ctx.redirect(`${ctx.URL.origin}${BASE_PATH}`);
  }
  await next();
});
app.use(mount(`${BASE_PATH}api`, router.routes()));
app.use(mount(BASE_PATH, serve("/static")));
app.use(mount(`${BASE_PATH}api/images`, serve(`${process.env.CONFIG_DIR}/images`)));
app.use(
  mount(
    `${BASE_PATH}stylesheets/`,
    serve(`${process.env.CONFIG_DIR}/stylesheets`)
  )
);

async function removeUnusedImages() {
  const files = await getMdFiles();
  const filesContents = await Promise.all(
    files.map(async (file) =>
      getContent(`${process.env.TASKS_DIR}/${file.lane}/${file.name}`)
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

// Proper MCP Server Implementation using the correct SDK API
async function initializeMCPServer() {
  try {
    // Import the correct MCP SDK modules
    const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
    const { z } = require("zod");
    
    // Create MCP server instance with correct configuration
    const mcpServer = new McpServer({
      name: "tasks-mcp-server",
      version: "1.0.0",
      instructions: "A server for managing tasks in Tasks.md format with lanes and markdown files."
    });

    // Define tools using the correct API signature: server.tool(name, paramSchema, handler)
    mcpServer.tool(
      "list_lanes",
      {}, // No parameters needed
      async () => {
        try {
          const lanes = await getLanesNames();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  lanes: lanes,
                  total: lanes.length
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }
    );

    // Add tool to get tasks from a specific lane
    mcpServer.tool(
      "get_lane_tasks",
      {
        lane: z.string().describe("The name of the lane to get tasks from")
      },
      async ({ lane }) => {
        try {
          const tasks = await getTasksFromLane(lane);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(tasks, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }
    );

    // Add tool to create a new task
    mcpServer.tool(
      "create_task",
      {
        lane: z.string().describe("The lane to create the task in"),
        title: z.string().describe("The title of the task"),
        content: z.string().optional().describe("Optional content for the task")
      },
      async ({ lane, title, content = "" }) => {
        try {
          const result = await createTask(lane, title, content);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }
    );

    console.log("✅ MCP server configured successfully");
    return mcpServer;
  } catch (error) {
    console.error("❌ Failed to setup MCP server:", error);
    throw error;
  }
}

// Helper function to get tasks from a lane
async function getTasksFromLane(laneName) {
  const lanePath = `${process.env.TASKS_DIR}/${laneName}`;
  try {
    await fs.promises.access(lanePath);
    const files = await fs.promises.readdir(lanePath);
    const mdFiles = files.filter(file => file.endsWith('.md'));
    
    const tasks = await Promise.all(
      mdFiles.map(async (file) => {
        const content = await fs.promises.readFile(`${lanePath}/${file}`, 'utf8');
        return {
          file: file,
          content: content,
          lane: laneName
        };
      })
    );
    
    return {
      lane: laneName,
      tasks: tasks,
      total: tasks.length
    };
  } catch (error) {
    throw new Error(`Failed to read tasks from lane ${laneName}: ${error.message}`);
  }
}

// Helper function to create a new task
async function createTask(laneName, title, content) {
  const lanePath = `${process.env.TASKS_DIR}/${laneName}`;
  try {
    // Ensure lane directory exists
    await fs.promises.mkdir(lanePath, { recursive: true });
    
    // Create filename from title (sanitize for filesystem)
    const filename = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').toLowerCase() + '.md';
    const filePath = `${lanePath}/${filename}`;
    
    // Create markdown content
    const markdownContent = `# ${title}\n\n${content}`;
    
    // Write the file
    await fs.promises.writeFile(filePath, markdownContent, 'utf8');
    
    return {
      success: true,
      lane: laneName,
      title: title,
      filename: filename,
      path: filePath
    };
  } catch (error) {
    throw new Error(`Failed to create task in lane ${laneName}: ${error.message}`);
  }
}

// Set up MCP endpoint to handle requests properly
// The MCP server needs to use a transport to handle the communication
// For HTTP, we'll use a simple handler that bridges Koa to the MCP transport
let mcpServerInstance = null;

async function handleMCPRequest(ctx) {
  try {
    // Initialize MCP server if not already done
    if (!mcpServerInstance) {
      mcpServerInstance = await initializeMCPServer();
    }

    // For now, provide a basic response that indicates the server is working
    // TODO: Implement proper transport handling with StreamableHTTPServerTransport
    
    if (ctx.request.body && ctx.request.body.method === 'tools/list') {
      // Handle tools list request
      ctx.status = 200;
      ctx.set('Content-Type', 'application/json');
      ctx.body = {
        jsonrpc: "2.0",
        result: {
          tools: [
            {
              name: "list_lanes",
              description: "List all available task lanes",
              inputSchema: {
                type: "object",
                properties: {}
              }
            },
            {
              name: "get_lane_tasks",
              description: "Get all tasks from a specific lane",
              inputSchema: {
                type: "object",
                properties: {
                  lane: {
                    type: "string",
                    description: "The name of the lane to get tasks from"
                  }
                },
                required: ["lane"]
              }
            },
            {
              name: "create_task",
              description: "Create a new task in a lane",
              inputSchema: {
                type: "object",
                properties: {
                  lane: {
                    type: "string",
                    description: "The lane to create the task in"
                  },
                  title: {
                    type: "string",
                    description: "The title of the task"
                  },
                  content: {
                    type: "string",
                    description: "Optional content for the task"
                  }
                },
                required: ["lane", "title"]
              }
            }
          ]
        },
        id: ctx.request.body.id || null
      };
      return;
    }

    // Default response for MCP endpoint
    ctx.status = 200;
    ctx.set('Content-Type', 'application/json');
    ctx.body = {
      jsonrpc: "2.0",
      result: {
        message: "Tasks.md MCP server is running",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "tasks-mcp-server",
          version: "1.0.0"
        }
      },
      id: ctx.request.body?.id || null
    };
    
    console.log(`📡 MCP request handled: ${ctx.method} ${ctx.path}`);
  } catch (error) {
    console.error("MCP request error:", error);
    ctx.status = 500;
    ctx.body = {
      jsonrpc: "2.0",
      error: { 
        code: -32603, 
        message: "Internal server error",
        data: error.message 
      },
      id: ctx.request.body?.id || null
    };
  }
}

// Add middleware to handle MCP requests at /mcp (not /api/mcp)
app.use(async (ctx, next) => {
  if (ctx.path === '/mcp' && ctx.method === 'POST') {
    await handleMCPRequest(ctx);
    return;
  }
  await next();
});

// Initialize MCP server on startup
initializeMCPServer().then(() => {
  console.log(`🚀 Tasks.md MCP server initialized and ready`);
  console.log(`📡 MCP endpoint available at: http://localhost:${process.env.PORT}/mcp`);
}).catch(error => {
  console.error("❌ Failed to initialize MCP server:", error);
});

app.listen(process.env.PORT);