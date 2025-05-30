const fs = require("fs");
const uuid = require("uuid");
const path = require("path");

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

// Helper function to extract title from filename
function extractTitleFromFilename(filename) {
  const nameWithoutExt = filename.replace('.md', '');
  
  // Check if it's new format (title-uuid)
  const parts = nameWithoutExt.split('-');
  if (parts.length > 1) {
    // Check if last part looks like a UUID (contains numbers/letters and dashes)
    const lastPart = parts[parts.length - 1];
    if (lastPart.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
      // Last part is UUID, everything before is title
      const titleParts = parts.slice(0, -1);
      return titleParts.join('-').replace(/-/g, ' '); // Convert dashes back to spaces
    }
  }
  
  // Legacy format (UUID only) or unrecognized format
  return nameWithoutExt; // Return the filename without extension as fallback
}

// Helper function to extract UUID from filename
function extractUUIDFromFilename(filename) {
  const nameWithoutExt = filename.replace('.md', '');
  
  // Check if it's new format (title-uuid)
  const parts = nameWithoutExt.split('-');
  if (parts.length > 1) {
    // Check if last part looks like a UUID
    const lastPart = parts[parts.length - 1];
    if (lastPart.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
      return lastPart;
    }
  }
  
  // Legacy format - assume the whole filename (without .md) is the UUID
  return nameWithoutExt;
}

async function getCards() {
  const files = await getMdFiles();
  const cards = await Promise.all(
    files.map(async (file) => {
      const content = await getContent(
        `${process.env.TASKS_DIR}/${file.lane}/${file.name}`
      );
      
      // Extract title from filename, fallback to filename if extraction fails
      const title = extractTitleFromFilename(file.name);
      
      return {
        lane: file.lane,
        name: title,
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
        const taskId = extractUUIDFromFilename(file);
        const title = extractTitleFromFilename(file);
        
        return {
          id: taskId,
          title: title,
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

async function getAllTasks() {
  try {
    const lanes = await getLanesNames();
    const allTasks = [];
    
    for (const lane of lanes) {
      const tasks = await getTasksFromLane(lane);
      allTasks.push(...tasks);
    }
    
    return allTasks;
  } catch (error) {
    throw new Error(`Failed to get all tasks: ${error.message}`);
  }
}

// Helper function to sanitize title for filename
function sanitizeTitleForFilename(title) {
  return title
    .replace(/\s+/g, '-')           // Replace spaces with dashes
    .replace(/-+/g, '-')            // Collapse multiple dashes
    .replace(/^-+|-+$/g, '');       // Remove leading/trailing dashes
}

// Helper function to create filename with title and UUID
function createTaskFilename(title, taskId) {
  const sanitizedTitle = sanitizeTitleForFilename(title);
  return `${sanitizedTitle}-${taskId}.md`;
}

async function createTask(laneName, title, content = "") {
  console.log(`🔧 createTask called with:`, { laneName, title, content });
  
  try {
    console.log(`🔧 Ensuring lane directory exists...`);
    // Ensure lane directory exists
    const laneDir = `${process.env.TASKS_DIR}/${laneName}`;
    console.log(`🔧 Lane directory path:`, laneDir);
    
    await fs.promises.mkdir(laneDir, { recursive: true });
    console.log(`🔧 Directory created/verified`);
    
    await fs.promises.chown(laneDir, PUID, PGID);
    console.log(`🔧 Directory permissions set`);
    
    console.log(`🔧 Generating task ID...`);
    // Generate unique task ID
    const taskId = uuid.v4();
    
    // Create filename with title and UUID
    const filename = createTaskFilename(title, taskId);
    const filePath = `${laneDir}/${filename}`;
    console.log(`🔧 Task ID, filename and file path:`, { taskId, filename, filePath });
    
    console.log(`🔧 Creating task content...`);
    // Content should NOT include the title as a heading since title is now in filename
    const taskContent = content;
    console.log(`🔧 Final task content:`, taskContent);
    
    console.log(`🔧 Writing file...`);
    // Write file
    await fs.promises.writeFile(filePath, taskContent);
    console.log(`🔧 File written successfully`);
    
    console.log(`🔧 Setting file permissions...`);
    await fs.promises.chown(filePath, PUID, PGID);
    console.log(`🔧 File permissions set`);
    
    const result = {
      id: taskId,
      lane: laneName,
      title,
      content: taskContent,
      tags: getTagsTextsFromCardContent(taskContent),
      path: filePath,
      filename
    };
    
    console.log(`🔧 createTask completed successfully:`, result);
    return result;
  } catch (error) {
    console.error(`❌ Error in createTask:`, error);
    throw new Error(`Failed to create task in lane ${laneName}: ${error.message}`);
  }
}

// Helper function to find a task file by UUID in a lane
async function findTaskFile(taskId, lane) {
  try {
    const laneDir = `${process.env.TASKS_DIR}/${lane}`;
    const files = await fs.promises.readdir(laneDir);
    
    // Look for file ending with -${taskId}.md
    const taskFile = files.find(file => 
      file.endsWith(`.md`) && file.endsWith(`-${taskId}.md`)
    );
    
    if (taskFile) {
      return `${laneDir}/${taskFile}`;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// Helper function to find a task across all lanes
async function findTaskFileInAllLanes(taskId) {
  try {
    const lanes = await getLanesNames();
    
    for (const lane of lanes) {
      const taskPath = await findTaskFile(taskId, lane);
      if (taskPath) {
        return { path: taskPath, lane };
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

async function updateTask(taskId, updates) {
  try {
    const { lane, content, newLane } = updates;
    
    // Find the current task file
    let currentPath = null;
    let currentLane = lane;
    
    if (lane) {
      currentPath = await findTaskFile(taskId, lane);
      if (!currentPath) {
        throw new Error(`Task ${taskId} not found in lane ${lane}`);
      }
    } else {
      // Search for the task across all lanes
      const result = await findTaskFileInAllLanes(taskId);
      if (result) {
        currentPath = result.path;
        currentLane = result.lane;
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
      
      // Extract filename and create new path
      const filename = path.basename(currentPath);
      const newPath = `${newLaneDir}/${filename}`;
      await fs.promises.rename(currentPath, newPath);
      currentPath = newPath;
      currentLane = newLane;
    }
    
    // Read final content
    const finalContent = await getContent(currentPath);
    const filename = path.basename(currentPath);
    const title = extractTitleFromFilename(filename);
    
    return {
      id: taskId,
      title: title,
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
      taskPath = await findTaskFile(taskId, lane);
    } else {
      // Search for the task across all lanes
      const result = await findTaskFileInAllLanes(taskId);
      if (result) {
        taskPath = result.path;
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
      taskPath = await findTaskFile(taskId, lane);
      if (!taskPath) {
        throw new Error(`Task ${taskId} not found in lane ${lane}`);
      }
    } else {
      // Search for the task across all lanes
      const result = await findTaskFileInAllLanes(taskId);
      if (result) {
        taskPath = result.path;
        taskLane = result.lane;
      }
    }
    
    if (!taskPath) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    const content = await getContent(taskPath);
    const tags = getTagsTextsFromCardContent(content);
    const filename = path.basename(taskPath);
    const title = extractTitleFromFilename(filename);
    
    return {
      id: taskId,
      title: title,
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

async function deleteLane(laneId) {
  try {
    const laneDir = `${process.env.TASKS_DIR}/${laneId}`;
    await fs.promises.rm(laneDir, { recursive: true });
    return { success: true, id: laneId };
  } catch (error) {
    throw new Error(`Failed to delete lane ${laneId}: ${error.message}`);
  }
}

async function renameLane(oldLaneId, newLaneId) {
  try {
    const oldPath = `${process.env.TASKS_DIR}/${oldLaneId}`;
    const newPath = `${process.env.TASKS_DIR}/${newLaneId}`;
    
    await fs.promises.rename(oldPath, newPath);
    return { success: true, oldId: oldLaneId, newId: newLaneId };
  } catch (error) {
    throw new Error(`Failed to rename lane from ${oldLaneId} to ${newLaneId}: ${error.message}`);
  }
}

async function moveTask(taskId, fromLane, toLane) {
  try {
    // Find the task file in the source lane
    const oldPath = await findTaskFile(taskId, fromLane);
    if (!oldPath) {
      throw new Error(`Task ${taskId} not found in lane ${fromLane}`);
    }
    
    // Read the content
    const content = await getContent(oldPath);
    
    // Ensure destination lane exists
    await fs.promises.mkdir(`${process.env.TASKS_DIR}/${toLane}`, { recursive: true });
    await fs.promises.chown(`${process.env.TASKS_DIR}/${toLane}`, PUID, PGID);
    
    // Extract filename and create new path
    const filename = path.basename(oldPath);
    const newPath = `${process.env.TASKS_DIR}/${toLane}/${filename}`;
    
    // Write to new location
    await fs.promises.writeFile(newPath, content);
    await fs.promises.chown(newPath, PUID, PGID);
    
    // Remove from old location
    await fs.promises.rm(oldPath);
    
    return { success: true, id: taskId, fromLane, toLane };
  } catch (error) {
    throw new Error(`Failed to move task ${taskId} from ${fromLane} to ${toLane}: ${error.message}`);
  }
}

async function renameTask(oldTaskId, newTaskId, lane) {
  try {
    // Find the task file 
    const oldPath = await findTaskFile(oldTaskId, lane);
    if (!oldPath) {
      throw new Error(`Task ${oldTaskId} not found in lane ${lane}`);
    }
    
    // Extract title from old filename
    const oldFilename = path.basename(oldPath, '.md');
    const titlePart = oldFilename.substring(0, oldFilename.lastIndexOf('-' + oldTaskId));
    
    // Create new filename with same title but new UUID
    const newFilename = `${titlePart}-${newTaskId}.md`;
    const newPath = `${process.env.TASKS_DIR}/${lane}/${newFilename}`;
    
    // Read content
    const content = await getContent(oldPath);
    
    // Write with new name
    await fs.promises.writeFile(newPath, content);
    await fs.promises.chown(newPath, PUID, PGID);
    
    // Remove old file
    await fs.promises.rm(oldPath);
    
    return { success: true, oldId: oldTaskId, newId: newTaskId, lane };
  } catch (error) {
    throw new Error(`Failed to rename task from ${oldTaskId} to ${newTaskId}: ${error.message}`);
  }
}

module.exports = {
  getLanesNames,
  getMdFiles,
  getContent,
  getTagsTextsFromCardContent,
  getCards,
  getTasksFromLane,
  getAllTasks,
  createTask,
  updateTask,
  deleteTask,
  getTaskContent,
  createLane,
  deleteLane,
  renameLane,
  moveTask,
  renameTask
}; 