const { z } = require("zod");
const taskOps = require("./task-operations");

/**
 * MCP Server implementation for Tasks.md
 * Provides AI agents access to task management functionality
 */

class TasksMCPServer {
  constructor() {
    this.server = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      return this.server;
    }

    try {
      // Import the correct MCP SDK modules
      const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
      
      // Create MCP server instance with correct configuration
      this.server = new McpServer({
        name: "tasks-mcp-server",
        version: "1.0.0",
        instructions: "A server for managing tasks in Tasks.md format with lanes and markdown files."
      });

      this.setupTools();
      this.isInitialized = true;
      
      console.log("✅ MCP server configured successfully");
      return this.server;
    } catch (error) {
      console.error("❌ Failed to setup MCP server:", error);
      throw error;
    }
  }

  setupTools() {
    // Tool: List all available lanes
    this.server.tool(
      "list_lanes",
      {}, // No parameters needed
      async () => {
        try {
          const lanes = await taskOps.getLanesNames();
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

    // Tool: Get all tasks from a specific lane
    this.server.tool(
      "get_lane_tasks",
      {
        lane: z.string().describe("The name of the lane to get tasks from")
      },
      async ({ lane }) => {
        try {
          const tasks = await taskOps.getTasksFromLane(lane);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  lane: lane,
                  tasks: tasks,
                  total: tasks.length
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

    // Tool: List all tasks across all lanes
    this.server.tool(
      "list_all_tasks",
      {},
      async () => {
        try {
          const cards = await taskOps.getCards();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  tasks: cards,
                  total: cards.length
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

    // Tool: Create a new task
    this.server.tool(
      "create_task",
      {
        lane: z.string().describe("The lane to create the task in"),
        title: z.string().describe("The title of the task"),
        content: z.string().optional().describe("Optional content for the task")
      },
      async ({ lane, title, content = "" }) => {
        try {
          const result = await taskOps.createTask(lane, title, content);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  task: result
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

    // Tool: Update an existing task
    this.server.tool(
      "update_task",
      {
        taskId: z.string().describe("The ID of the task to update"),
        content: z.string().optional().describe("New content for the task"),
        newLane: z.string().optional().describe("New lane to move the task to"),
        lane: z.string().optional().describe("Current lane of the task (for optimization)")
      },
      async ({ taskId, content, newLane, lane }) => {
        try {
          const updates = {};
          if (content !== undefined) updates.content = content;
          if (newLane !== undefined) updates.newLane = newLane;
          if (lane !== undefined) updates.lane = lane;

          const result = await taskOps.updateTask(taskId, updates);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  task: result
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

    // Tool: Delete a task
    this.server.tool(
      "delete_task",
      {
        taskId: z.string().describe("The ID of the task to delete"),
        lane: z.string().optional().describe("Current lane of the task (for optimization)")
      },
      async ({ taskId, lane }) => {
        try {
          const result = await taskOps.deleteTask(taskId, lane);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  deletedTask: result
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

    // Tool: Get specific task content
    this.server.tool(
      "get_task_content",
      {
        taskId: z.string().describe("The ID of the task to retrieve"),
        lane: z.string().optional().describe("Current lane of the task (for optimization)")
      },
      async ({ taskId, lane }) => {
        try {
          const task = await taskOps.getTaskContent(taskId, lane);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(task, null, 2)
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

    // Tool: Create a new lane
    this.server.tool(
      "create_lane",
      {
        name: z.string().optional().describe("Name for the new lane (auto-generated if not provided)")
      },
      async ({ name }) => {
        try {
          const result = await taskOps.createLane(name);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  lane: result
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
  }

  // Helper method to get tool definitions for HTTP responses
  getToolDefinitions() {
    return [
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
        name: "list_all_tasks",
        description: "List all tasks across all lanes",
        inputSchema: {
          type: "object",
          properties: {}
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
      },
      {
        name: "update_task",
        description: "Update an existing task's content or move it to a different lane",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "The ID of the task to update"
            },
            content: {
              type: "string",
              description: "New content for the task"
            },
            newLane: {
              type: "string",
              description: "New lane to move the task to"
            },
            lane: {
              type: "string",
              description: "Current lane of the task (for optimization)"
            }
          },
          required: ["taskId"]
        }
      },
      {
        name: "delete_task",
        description: "Delete a task",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "The ID of the task to delete"
            },
            lane: {
              type: "string",
              description: "Current lane of the task (for optimization)"
            }
          },
          required: ["taskId"]
        }
      },
      {
        name: "get_task_content",
        description: "Get the content and metadata of a specific task",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "The ID of the task to retrieve"
            },
            lane: {
              type: "string",
              description: "Current lane of the task (for optimization)"
            }
          },
          required: ["taskId"]
        }
      },
      {
        name: "create_lane",
        description: "Create a new task lane",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name for the new lane (auto-generated if not provided)"
            }
          }
        }
      }
    ];
  }

  getServerInfo() {
    return {
      name: "tasks-mcp-server",
      version: "1.0.0",
      capabilities: {
        tools: {}
      }
    };
  }
}

module.exports = TasksMCPServer; 