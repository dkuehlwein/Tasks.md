const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z } = require("zod");
const taskOps = require("./task-operations");

/**
 * Official MCP Server implementation for Tasks.md
 * Uses the official @modelcontextprotocol/sdk with high-level McpServer
 */

class TasksMCPServerOfficial {
  constructor() {
    this.server = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      return this.server;
    }

    try {
      // Create MCP server instance with correct configuration
      this.server = new McpServer({
        name: "tasks-mcp-server",
        version: "1.0.0",
        description: "A Model Context Protocol server for managing Tasks.md kanban boards",
        instructions: `This server provides tools for managing Tasks.md kanban boards with lane-based organization.
        
Available tools:
- list_lanes: Get all available lanes (columns) in the kanban board
- list_all_tasks: Get all tasks across all lanes 
- get_lane_tasks: Get all tasks from a specific lane
- add_task: Add a new task to a specific lane
- update_task: Modify an existing task's content
- delete_task: Remove a task from the board
- move_task: Move a task between lanes
- get_task: Get details of a specific task

Each task has an auto-generated ID, title, lane, and optional description and tags.
Valid lanes are: Backlog, Todo, In Progress, Done

The system automatically manages file paths and uses lane-based organization.`
      });

      // Register tools
      this.registerTools();

      this.isInitialized = true;
      return this.server;
    } catch (error) {
      console.error("Failed to initialize MCP server:", error);
      throw error;
    }
  }

  registerTools() {
    // List all available lanes
    this.server.tool(
      "list_lanes",
      "Get all available lanes (columns) in the kanban board",
      {},
      async () => {
        try {
          const lanes = await taskOps.getLanesNames();
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ lanes }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text", 
              text: `Error listing lanes: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // List all tasks across all lanes
    this.server.tool(
      "list_all_tasks", 
      "Get all tasks from all lanes in the kanban board",
      {},
      async () => {
        try {
          const tasks = await taskOps.getAllTasks();
          return {
            content: [{
              type: "text",
              text: JSON.stringify(tasks, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text", 
              text: `Error listing tasks: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // Get tasks from a specific lane
    this.server.tool(
      "get_lane_tasks",
      "Get all tasks from a specific lane",
      {
        lane: z.string().describe("Name of the lane to get tasks from")
      },
      async ({ lane }) => {
        try {
          const tasks = await taskOps.getTasksFromLane(lane);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ lane, tasks }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text", 
              text: `Error getting tasks from lane ${lane}: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // Add a new task
    this.server.tool(
      "add_task",
      "Add a new task to a kanban board lane",
      {
        title: z.string().describe("Title of the new task"),
        lane: z.enum(["Backlog", "Todo", "In Progress", "Done"]).describe("Lane to add the task to"),
        content: z.string().optional().describe("Optional content/description for the task"),
        tags: z.array(z.string()).optional().describe("Optional tags for the task (will be added to content)")
      },
      async ({ title, lane, content = "", tags = [] }) => {
        console.log(`🔧 add_task called with:`, { title, lane, content, tags });
        
        try {
          console.log(`🔧 Processing tags...`);
          // Add tags to content if provided
          let taskContent = content;
          if (tags.length > 0) {
            const tagString = tags.map(tag => `#${tag}`).join(" ");
            taskContent = content ? `${content}\n\n${tagString}` : tagString;
          }
          console.log(`🔧 Task content prepared:`, { taskContent });

          console.log(`🔧 Calling taskOps.createTask...`);
          const task = await taskOps.createTask(lane, title, taskContent);
          console.log(`🔧 Task created successfully:`, task);
          
          const response = {
            content: [{
              type: "text",
              text: `Task added successfully to ${lane} lane:\n${JSON.stringify(task, null, 2)}`
            }]
          };
          console.log(`🔧 Returning response:`, response);
          
          return response;
        } catch (error) {
          console.error(`❌ Error in add_task:`, error);
          const errorResponse = {
            content: [{
              type: "text",
              text: `Error adding task: ${error.message}`
            }],
            isError: true
          };
          console.log(`🔧 Returning error response:`, errorResponse);
          return errorResponse;
        }
      }
    );

    // Update an existing task
    this.server.tool(
      "update_task",
      "Update an existing task's content",
      {
        task_id: z.string().describe("ID of the task to update"),
        content: z.string().optional().describe("New content for the task"),
        new_lane: z.enum(["Backlog", "Todo", "In Progress", "Done"]).optional().describe("New lane to move the task to"),
        current_lane: z.string().optional().describe("Current lane of the task (for optimization, leave blank to auto-search)")
      },
      async ({ task_id, content, new_lane, current_lane }) => {
        try {
          const updates = {};
          if (content !== undefined) updates.content = content;
          if (new_lane !== undefined) updates.newLane = new_lane;
          if (current_lane !== undefined) updates.lane = current_lane;

          const task = await taskOps.updateTask(task_id, updates);
          return {
            content: [{
              type: "text",
              text: `Task updated successfully:\n${JSON.stringify(task, null, 2)}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error updating task: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // Delete a task
    this.server.tool(
      "delete_task",
      "Delete a task from the kanban board",
      {
        task_id: z.string().describe("ID of the task to delete"),
        lane: z.string().optional().describe("Lane the task is in (for optimization, leave blank to auto-search)")
      },
      async ({ task_id, lane }) => {
        try {
          const result = await taskOps.deleteTask(task_id, lane);
          return {
            content: [{
              type: "text",
              text: `Task ${task_id} deleted successfully`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error deleting task: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // Move task between lanes
    this.server.tool(
      "move_task",
      "Move a task between lanes",
      {
        task_id: z.string().describe("ID of the task to move"),
        from_lane: z.string().describe("Current lane of the task"),
        to_lane: z.enum(["Backlog", "Todo", "In Progress", "Done"]).describe("Lane to move the task to")
      },
      async ({ task_id, from_lane, to_lane }) => {
        try {
          const result = await taskOps.moveTask(task_id, from_lane, to_lane);
          return {
            content: [{
              type: "text",
              text: `Task ${task_id} moved successfully from ${from_lane} to ${to_lane}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error moving task: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // Get a specific task
    this.server.tool(
      "get_task",
      "Get details of a specific task",
      {
        task_id: z.string().describe("ID of the task to retrieve"),
        lane: z.string().optional().describe("Lane the task is in (for optimization, leave blank to auto-search)")
      },
      async ({ task_id, lane }) => {
        try {
          const task = await taskOps.getTaskContent(task_id, lane);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(task, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error getting task: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );
  }

  async run() {
    console.error("🚀 Starting Tasks.md MCP Server (Official SDK - Lane-based)");
    await this.initialize();
    await this.server.run();
  }

  async close() {
    if (this.server) {
      await this.server.close();
    }
  }
}

module.exports = TasksMCPServerOfficial; 