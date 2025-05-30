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
        description: "A Model Context Protocol server for managing Tasks.md files",
        instructions: `This server provides tools for managing Tasks.md kanban boards.
        
Available tools:
- list_tasks: Get all tasks from a tasks.md file
- add_task: Add a new task to a kanban board
- update_task: Modify an existing task
- delete_task: Remove a task from the board
- move_task: Move a task between columns
- get_task: Get details of a specific task

Each task has an ID, title, column, and optional description and tags.
Valid columns are: Backlog, Todo, In Progress, Done`
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
    // List all tasks from a file
    this.server.tool(
      "list_tasks",
      {
        file_path: z.string().describe("Path to the tasks.md file")
      },
      {
        description: "Get all tasks from a tasks.md file"
      },
      async ({ file_path }) => {
        try {
          const tasks = await taskOps.listTasks(file_path);
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

    // Add a new task
    this.server.tool(
      "add_task",
      {
        file_path: z.string().describe("Path to the tasks.md file"),
        title: z.string().describe("Title of the new task"),
        column: z.enum(["Backlog", "Todo", "In Progress", "Done"]).describe("Column to add the task to"),
        description: z.string().optional().describe("Optional description for the task"),
        tags: z.array(z.string()).optional().describe("Optional tags for the task")
      },
      {
        description: "Add a new task to a kanban board"
      },
      async ({ file_path, title, column, description, tags }) => {
        try {
          const task = await taskOps.addTask(file_path, { title, column, description, tags });
          return {
            content: [{
              type: "text",
              text: `Task added successfully: ${JSON.stringify(task, null, 2)}`
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error adding task: ${error.message}`
            }],
            isError: true
          };
        }
      }
    );

    // Update an existing task
    this.server.tool(
      "update_task",
      {
        file_path: z.string().describe("Path to the tasks.md file"),
        task_id: z.string().describe("ID of the task to update"),
        updates: z.object({
          title: z.string().optional(),
          description: z.string().optional(),
          tags: z.array(z.string()).optional()
        }).describe("Fields to update")
      },
      {
        description: "Update an existing task"
      },
      async ({ file_path, task_id, updates }) => {
        try {
          const task = await taskOps.updateTask(file_path, task_id, updates);
          return {
            content: [{
              type: "text",
              text: `Task updated successfully: ${JSON.stringify(task, null, 2)}`
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
      {
        file_path: z.string().describe("Path to the tasks.md file"),
        task_id: z.string().describe("ID of the task to delete")
      },
      {
        description: "Delete a task from the kanban board"
      },
      async ({ file_path, task_id }) => {
        try {
          await taskOps.deleteTask(file_path, task_id);
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

    // Move task between columns
    this.server.tool(
      "move_task",
      {
        file_path: z.string().describe("Path to the tasks.md file"),
        task_id: z.string().describe("ID of the task to move"),
        new_column: z.enum(["Backlog", "Todo", "In Progress", "Done"]).describe("Column to move the task to")
      },
      {
        description: "Move a task between columns"
      },
      async ({ file_path, task_id, new_column }) => {
        try {
          const task = await taskOps.moveTask(file_path, task_id, new_column);
          return {
            content: [{
              type: "text",
              text: `Task moved successfully: ${JSON.stringify(task, null, 2)}`
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
      {
        file_path: z.string().describe("Path to the tasks.md file"),
        task_id: z.string().describe("ID of the task to retrieve")
      },
      {
        description: "Get details of a specific task"
      },
      async ({ file_path, task_id }) => {
        try {
          const task = await taskOps.getTask(file_path, task_id);
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

  async close() {
    if (this.server) {
      await this.server.close();
    }
  }
}

module.exports = TasksMCPServerOfficial; 