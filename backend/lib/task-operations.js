const fs = require("fs");
const uuid = require("uuid");

const PUID = Number(process.env.PUID) || 1000;
const PGID = Number(process.env.PGID) || 1000;

/**
 * Core task management operations shared between web API and MCP server
 */

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

function getTagsTextsFromCardContent(content) {
  return (content.match(/#[a-zA-Z0-9_]+/g) || []).map((tag) => tag.slice(1));
}

async function getCards() {
  const files = await getMdFiles();
  const cards = await Promise.all(
    files.map(async (file) => {
      const content = await getContent(
        `${process.env.TASKS_DIR}/${file.lane}/${file.name}`
      );
      return {
        lane: file.lane,
        name: file.name.replace(".md", ""),
        content,
        tags: getTagsTextsFromCardContent(content),
      };
    })
  );
  return cards;
}

async function getTasksFromLane(laneName) {
  try {
    const laneDir = `${process.env.TASKS_DIR}/${laneName}`;
    const files = await fs.promises.readdir(laneDir);
    const mdFiles = files.filter(file => file.endsWith('.md'));
    
    const tasks = await Promise.all(
      mdFiles.map(async (file) => {
        const filePath = `${laneDir}/${file}`;
        const content = await getContent(filePath);
        const taskId = file.replace('.md', '');
        
        return {
          id: taskId,
          lane: laneName,
          content,
          tags: getTagsTextsFromCardContent(content),
          filePath
        };
      })
    );
    
    return tasks;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []; // Lane doesn't exist, return empty array
    }
    throw error;
  }
}

async function createTask(laneName, title, content = "") {
  try {
    // Ensure lane directory exists
    const laneDir = `${process.env.TASKS_DIR}/${laneName}`;
    await fs.promises.mkdir(laneDir, { recursive: true });
    await fs.promises.chown(laneDir, PUID, PGID);
    
    // Generate unique task ID
    const taskId = uuid.v4();
    const filePath = `${laneDir}/${taskId}.md`;
    
    // Create task content with title
    const taskContent = title ? `# ${title}\n\n${content}` : content;
    
    // Write file
    await fs.promises.writeFile(filePath, taskContent);
    await fs.promises.chown(filePath, PUID, PGID);
    
    return {
      id: taskId,
      lane: laneName,
      title,
      content: taskContent,
      path: filePath
    };
  } catch (error) {
    throw new Error(`Failed to create task in lane ${laneName}: ${error.message}`);
  }
}

async function updateTask(taskId, updates) {
  try {
    const { lane, content, newLane } = updates;
    
    // Find the current task file
    let currentPath = null;
    let currentLane = lane;
    
    if (lane) {
      currentPath = `${process.env.TASKS_DIR}/${lane}/${taskId}.md`;
    } else {
      // Search for the task across all lanes
      const lanes = await getLanesNames();
      for (const searchLane of lanes) {
        const searchPath = `${process.env.TASKS_DIR}/${searchLane}/${taskId}.md`;
        try {
          await fs.promises.access(searchPath);
          currentPath = searchPath;
          currentLane = searchLane;
          break;
        } catch (e) {
          // Continue searching
        }
      }
    }
    
    if (!currentPath) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    // Update content if provided
    if (content !== undefined) {
      await fs.promises.writeFile(currentPath, content);
      await fs.promises.chown(currentPath, PUID, PGID);
    }
    
    // Move to new lane if specified
    if (newLane && newLane !== currentLane) {
      const newLaneDir = `${process.env.TASKS_DIR}/${newLane}`;
      await fs.promises.mkdir(newLaneDir, { recursive: true });
      await fs.promises.chown(newLaneDir, PUID, PGID);
      
      const newPath = `${newLaneDir}/${taskId}.md`;
      await fs.promises.rename(currentPath, newPath);
      currentPath = newPath;
      currentLane = newLane;
    }
    
    // Read final content
    const finalContent = await getContent(currentPath);
    
    return {
      id: taskId,
      lane: currentLane,
      content: finalContent,
      tags: getTagsTextsFromCardContent(finalContent),
      path: currentPath
    };
  } catch (error) {
    throw new Error(`Failed to update task ${taskId}: ${error.message}`);
  }
}

async function deleteTask(taskId, lane) {
  try {
    let taskPath = null;
    
    if (lane) {
      taskPath = `${process.env.TASKS_DIR}/${lane}/${taskId}.md`;
    } else {
      // Search for the task across all lanes
      const lanes = await getLanesNames();
      for (const searchLane of lanes) {
        const searchPath = `${process.env.TASKS_DIR}/${searchLane}/${taskId}.md`;
        try {
          await fs.promises.access(searchPath);
          taskPath = searchPath;
          break;
        } catch (e) {
          // Continue searching
        }
      }
    }
    
    if (!taskPath) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    await fs.promises.unlink(taskPath);
    return { success: true, id: taskId };
  } catch (error) {
    throw new Error(`Failed to delete task ${taskId}: ${error.message}`);
  }
}

async function getTaskContent(taskId, lane) {
  try {
    let taskPath = null;
    let taskLane = lane;
    
    if (lane) {
      taskPath = `${process.env.TASKS_DIR}/${lane}/${taskId}.md`;
    } else {
      // Search for the task across all lanes
      const lanes = await getLanesNames();
      for (const searchLane of lanes) {
        const searchPath = `${process.env.TASKS_DIR}/${searchLane}/${taskId}.md`;
        try {
          await fs.promises.access(searchPath);
          taskPath = searchPath;
          taskLane = searchLane;
          break;
        } catch (e) {
          // Continue searching
        }
      }
    }
    
    if (!taskPath) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    const content = await getContent(taskPath);
    const tags = getTagsTextsFromCardContent(content);
    
    return {
      id: taskId,
      lane: taskLane,
      content,
      tags,
      path: taskPath
    };
  } catch (error) {
    throw new Error(`Failed to get task content for ${taskId}: ${error.message}`);
  }
}

async function createLane(laneName) {
  try {
    const laneId = laneName || uuid.v4();
    const laneDir = `${process.env.TASKS_DIR}/${laneId}`;
    
    await fs.promises.mkdir(laneDir, { recursive: true });
    await fs.promises.chown(laneDir, PUID, PGID);
    
    return { id: laneId, path: laneDir };
  } catch (error) {
    throw new Error(`Failed to create lane: ${error.message}`);
  }
}

module.exports = {
  getLanesNames,
  getMdFiles,
  getContent,
  getTagsTextsFromCardContent,
  getCards,
  getTasksFromLane,
  createTask,
  updateTask,
  deleteTask,
  getTaskContent,
  createLane
}; 