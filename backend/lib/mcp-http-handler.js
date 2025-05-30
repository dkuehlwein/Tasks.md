const TasksMCPServer = require('./mcp-server');
const { v4: uuidv4 } = require('uuid');

/**
 * HTTP handler for MCP requests
 * Bridges between Koa web server and MCP server with FastMCP session compatibility
 */

class MCPHttpHandler {
  constructor() {
    this.mcpServer = null;
    this.sessions = new Map(); // Store session data
  }

  async initialize() {
    if (!this.mcpServer) {
      this.mcpServer = new TasksMCPServer();
      await this.mcpServer.initialize();
    }
    return this.mcpServer;
  }

  async handleRequest(ctx) {
    try {
      // Initialize MCP server if not already done
      await this.initialize();

      const requestBody = ctx.request.body || {};
      
      // Handle different types of MCP requests
      switch (requestBody.method) {
        case 'tools/list':
          return this.handleToolsList(ctx, requestBody);
        
        case 'tools/call':
          return this.handleToolCall(ctx, requestBody);
        
        case 'initialize':
          return this.handleInitialize(ctx, requestBody);
        
        case 'notifications/initialized':
          return this.handleNotificationsInitialized(ctx, requestBody);
        
        default:
          return this.handleDefault(ctx, requestBody);
      }
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
        id: requestBody?.id || null
      };
    }
  }

  // Validate session for requests that require it
  validateSession(ctx) {
    const sessionId = ctx.headers['mcp-session-id'];
    if (!sessionId || !this.sessions.has(sessionId)) {
      return null;
    }
    return sessionId;
  }

  handleToolsList(ctx, requestBody) {
    // Validate session for tools/list requests
    const sessionId = this.validateSession(ctx);
    if (!sessionId) {
      ctx.status = 401;
      ctx.body = {
        jsonrpc: "2.0",
        error: {
          code: -32600,
          message: "Invalid session. Please initialize first.",
        },
        id: requestBody.id || null
      };
      return;
    }

    ctx.status = 200;
    ctx.set('Content-Type', 'application/json');
    ctx.body = {
      jsonrpc: "2.0",
      result: {
        tools: this.mcpServer.getToolDefinitions()
      },
      id: requestBody.id || null
    };
  }

  async handleToolCall(ctx, requestBody) {
    try {
      // Validate session for tool calls
      const sessionId = this.validateSession(ctx);
      if (!sessionId) {
        ctx.status = 401;
        ctx.body = {
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: "Invalid session. Please initialize first.",
          },
          id: requestBody.id || null
        };
        return;
      }

      const { params } = requestBody;
      const { name, arguments: toolArgs } = params;

      // Map tool calls to the actual MCP server tools
      let result;
      
      switch (name) {
        case 'list_lanes':
          result = await this.callMCPTool('list_lanes', {});
          break;
        case 'get_lane_tasks':
          result = await this.callMCPTool('get_lane_tasks', toolArgs);
          break;
        case 'list_all_tasks':
          result = await this.callMCPTool('list_all_tasks', {});
          break;
        case 'create_task':
          result = await this.callMCPTool('create_task', toolArgs);
          break;
        case 'update_task':
          result = await this.callMCPTool('update_task', toolArgs);
          break;
        case 'delete_task':
          result = await this.callMCPTool('delete_task', toolArgs);
          break;
        case 'get_task_content':
          result = await this.callMCPTool('get_task_content', toolArgs);
          break;
        case 'create_lane':
          result = await this.callMCPTool('create_lane', toolArgs);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      ctx.status = 200;
      ctx.set('Content-Type', 'application/json');
      ctx.body = {
        jsonrpc: "2.0",
        result,
        id: requestBody.id || null
      };
    } catch (error) {
      ctx.status = 400;
      ctx.body = {
        jsonrpc: "2.0",
        error: {
          code: -32602,
          message: "Invalid tool call",
          data: error.message
        },
        id: requestBody.id || null
      };
    }
  }

  handleInitialize(ctx, requestBody) {
    // Generate new session ID for FastMCP compatibility
    const sessionId = uuidv4();
    
    // Store session data
    this.sessions.set(sessionId, {
      created: new Date(),
      initialized: false,
      clientInfo: requestBody.params?.clientInfo || {}
    });

    // Set session ID in response header (FastMCP requirement)
    ctx.set('mcp-session-id', sessionId);
    ctx.status = 200;
    ctx.set('Content-Type', 'application/json');
    
    ctx.body = {
      jsonrpc: "2.0",
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo: this.mcpServer.getServerInfo()
      },
      id: requestBody.id || null
    };
    
    console.log(`🔐 MCP session created: ${sessionId}`);
  }

  handleNotificationsInitialized(ctx, requestBody) {
    // Handle the notifications/initialized step in FastMCP protocol
    const sessionId = ctx.headers['mcp-session-id'];
    
    if (!sessionId || !this.sessions.has(sessionId)) {
      ctx.status = 401;
      ctx.body = {
        jsonrpc: "2.0",
        error: {
          code: -32600,
          message: "Invalid session ID"
        }
      };
      return;
    }

    // Mark session as fully initialized
    const session = this.sessions.get(sessionId);
    session.initialized = true;
    this.sessions.set(sessionId, session);

    ctx.status = 200;
    ctx.set('Content-Type', 'application/json');
    ctx.body = {
      jsonrpc: "2.0"
      // Note: notifications/initialized typically doesn't have a result
    };
    
    console.log(`✅ MCP session initialized: ${sessionId}`);
  }

  handleDefault(ctx, requestBody) {
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
        serverInfo: this.mcpServer.getServerInfo()
      },
      id: requestBody?.id || null
    };
    
    console.log(`📡 MCP request handled: ${ctx.method} ${ctx.path}`);
  }

  // Simplified tool calling - in practice, this would go through proper MCP transport
  async callMCPTool(toolName, args) {
    // This is a simplified implementation
    // In a real MCP setup, this would go through the proper transport layer
    const taskOps = require('./task-operations');
    
    switch (toolName) {
      case 'list_lanes':
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
      
      case 'get_lane_tasks':
        const tasks = await taskOps.getTasksFromLane(args.lane);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                lane: args.lane,
                tasks: tasks,
                total: tasks.length
              }, null, 2)
            }
          ]
        };
      
      case 'list_all_tasks':
        const allTasks = await taskOps.getCards();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                tasks: allTasks,
                total: allTasks.length
              }, null, 2)
            }
          ]
        };
      
      case 'create_task':
        const newTask = await taskOps.createTask(args.lane, args.title, args.content || "");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                task: newTask
              }, null, 2)
            }
          ]
        };
      
      case 'update_task':
        const updates = {};
        if (args.content !== undefined) updates.content = args.content;
        if (args.newLane !== undefined) updates.newLane = args.newLane;
        if (args.lane !== undefined) updates.lane = args.lane;
        
        const updatedTask = await taskOps.updateTask(args.taskId, updates);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                task: updatedTask
              }, null, 2)
            }
          ]
        };
      
      case 'delete_task':
        const deleteResult = await taskOps.deleteTask(args.taskId, args.lane);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                deletedTask: deleteResult
              }, null, 2)
            }
          ]
        };
      
      case 'get_task_content':
        const taskContent = await taskOps.getTaskContent(args.taskId, args.lane);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(taskContent, null, 2)
            }
          ]
        };
      
      case 'create_lane':
        const newLane = await taskOps.createLane(args.name);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                lane: newLane
              }, null, 2)
            }
          ]
        };
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}

module.exports = MCPHttpHandler; 