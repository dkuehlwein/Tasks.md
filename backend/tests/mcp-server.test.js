const fs = require('fs');
const path = require('path');
const TasksMCPServer = require('../lib/mcp-server');
const MCPHttpHandler = require('../lib/mcp-http-handler');

// Mock environment variables
process.env.TASKS_DIR = './test-tasks-mcp';
process.env.CONFIG_DIR = './test-config-mcp';
process.env.PUID = '1000';
process.env.PGID = '1000';

describe('MCP Server', () => {
  const testTasksDir = './test-tasks-mcp';
  const testConfigDir = './test-config-mcp';
  let mcpServer;

  beforeEach(async () => {
    // Clean up and create test directories
    try {
      await fs.promises.rm(testTasksDir, { recursive: true, force: true });
      await fs.promises.rm(testConfigDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    
    await fs.promises.mkdir(testTasksDir, { recursive: true });
    await fs.promises.mkdir(testConfigDir, { recursive: true });
    
    // Create test lanes and tasks
    await fs.promises.mkdir(path.join(testTasksDir, 'backlog'), { recursive: true });
    await fs.promises.mkdir(path.join(testTasksDir, 'in-progress'), { recursive: true });
    
    await fs.promises.writeFile(
      path.join(testTasksDir, 'backlog', 'task1.md'),
      '# Task 1\n\nTask 1 content #urgent'
    );
    
    // Initialize MCP server
    mcpServer = new TasksMCPServer();
    await mcpServer.initialize();
  });

  afterEach(async () => {
    // Clean up test directories
    try {
      await fs.promises.rm(testTasksDir, { recursive: true, force: true });
      await fs.promises.rm(testConfigDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('TasksMCPServer', () => {
    test('should initialize successfully', () => {
      expect(mcpServer.isInitialized).toBe(true);
      expect(mcpServer.server).toBeDefined();
    });

    test('should provide correct server info', () => {
      const serverInfo = mcpServer.getServerInfo();
      expect(serverInfo.name).toBe('tasks-mcp-server');
      expect(serverInfo.version).toBe('1.0.0');
      expect(serverInfo.capabilities).toBeDefined();
    });

    test('should provide tool definitions', () => {
      const tools = mcpServer.getToolDefinitions();
      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);
      
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('list_lanes');
      expect(toolNames).toContain('create_task');
      expect(toolNames).toContain('get_lane_tasks');
      expect(toolNames).toContain('update_task');
      expect(toolNames).toContain('delete_task');
      expect(toolNames).toContain('get_task_content');
      expect(toolNames).toContain('create_lane');
    });

    test('should validate tool schema structure', () => {
      const tools = mcpServer.getToolDefinitions();
      
      tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type');
        expect(tool.inputSchema.type).toBe('object');
      });
    });
  });

  describe('MCPHttpHandler', () => {
    let handler;
    let mockCtx;

    beforeEach(async () => {
      handler = new MCPHttpHandler();
      await handler.initialize();

      // Mock Koa context
      mockCtx = {
        request: { body: {} },
        status: 200,
        body: {},
        set: jest.fn()
      };
    });

    test('should handle tools/list request', async () => {
      mockCtx.request.body = {
        method: 'tools/list',
        id: 'test-123'
      };

      await handler.handleRequest(mockCtx);

      expect(mockCtx.status).toBe(200);
      expect(mockCtx.body.jsonrpc).toBe('2.0');
      expect(mockCtx.body.result.tools).toBeDefined();
      expect(mockCtx.body.id).toBe('test-123');
    });

    test('should handle initialize request', async () => {
      mockCtx.request.body = {
        method: 'initialize',
        id: 'init-123'
      };

      await handler.handleRequest(mockCtx);

      expect(mockCtx.status).toBe(200);
      expect(mockCtx.body.result.protocolVersion).toBeDefined();
      expect(mockCtx.body.result.capabilities).toBeDefined();
      expect(mockCtx.body.result.serverInfo).toBeDefined();
    });

    test('should handle default request', async () => {
      mockCtx.request.body = {
        method: 'unknown',
        id: 'default-123'
      };

      await handler.handleRequest(mockCtx);

      expect(mockCtx.status).toBe(200);
      expect(mockCtx.body.result.message).toContain('running');
    });

    test('should handle tool call - list_lanes', async () => {
      mockCtx.request.body = {
        method: 'tools/call',
        params: {
          name: 'list_lanes',
          arguments: {}
        },
        id: 'call-123'
      };

      await handler.handleRequest(mockCtx);

      expect(mockCtx.status).toBe(200);
      expect(mockCtx.body.result.content).toBeDefined();
      expect(mockCtx.body.result.content[0].type).toBe('text');
      
      const response = JSON.parse(mockCtx.body.result.content[0].text);
      expect(response.lanes).toContain('backlog');
      expect(response.lanes).toContain('in-progress');
    });

    test('should handle tool call - get_lane_tasks', async () => {
      mockCtx.request.body = {
        method: 'tools/call',
        params: {
          name: 'get_lane_tasks',
          arguments: { lane: 'backlog' }
        },
        id: 'call-123'
      };

      await handler.handleRequest(mockCtx);

      expect(mockCtx.status).toBe(200);
      const response = JSON.parse(mockCtx.body.result.content[0].text);
      expect(response.lane).toBe('backlog');
      expect(response.tasks).toHaveLength(1);
      expect(response.tasks[0].id).toBe('task1');
    });

    test('should handle tool call - create_task', async () => {
      mockCtx.request.body = {
        method: 'tools/call',
        params: {
          name: 'create_task',
          arguments: { 
            lane: 'backlog', 
            title: 'New Task', 
            content: 'Task content' 
          }
        },
        id: 'call-123'
      };

      await handler.handleRequest(mockCtx);

      expect(mockCtx.status).toBe(200);
      const response = JSON.parse(mockCtx.body.result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.task.title).toBe('New Task');
      expect(response.task.lane).toBe('backlog');
    });

    test('should handle errors gracefully', async () => {
      mockCtx.request.body = {
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {}
        },
        id: 'error-123'
      };

      await handler.handleRequest(mockCtx);

      expect(mockCtx.status).toBe(400);
      expect(mockCtx.body.error).toBeDefined();
      expect(mockCtx.body.error.message).toBe('Invalid tool call');
    });
  });

  describe('MCP Tool Integration', () => {
    let handler;

    beforeEach(async () => {
      handler = new MCPHttpHandler();
      await handler.initialize();
    });

    test('should complete full task lifecycle', async () => {
      // Create task
      let result = await handler.callMCPTool('create_task', {
        lane: 'backlog',
        title: 'Integration Test Task',
        content: 'Test content'
      });
      
      expect(result.content[0].text).toContain('success');
      const createResponse = JSON.parse(result.content[0].text);
      const taskId = createResponse.task.id;

      // Get task content
      result = await handler.callMCPTool('get_task_content', { taskId });
      const getResponse = JSON.parse(result.content[0].text);
      expect(getResponse.id).toBe(taskId);
      expect(getResponse.content).toContain('Integration Test Task');

      // Update task
      result = await handler.callMCPTool('update_task', {
        taskId,
        content: '# Updated Integration Test\n\nUpdated content'
      });
      const updateResponse = JSON.parse(result.content[0].text);
      expect(updateResponse.success).toBe(true);

      // Delete task
      result = await handler.callMCPTool('delete_task', { taskId });
      const deleteResponse = JSON.parse(result.content[0].text);
      expect(deleteResponse.success).toBe(true);
    });

    test('should handle lane operations', async () => {
      // Create new lane
      let result = await handler.callMCPTool('create_lane', { name: 'test-lane' });
      const createResponse = JSON.parse(result.content[0].text);
      expect(createResponse.success).toBe(true);
      expect(createResponse.lane.id).toBe('test-lane');

      // List lanes should include new lane
      result = await handler.callMCPTool('list_lanes', {});
      const listResponse = JSON.parse(result.content[0].text);
      expect(listResponse.lanes).toContain('test-lane');
    });

    test('should handle task movement between lanes', async () => {
      // Create task in backlog
      let result = await handler.callMCPTool('create_task', {
        lane: 'backlog',
        title: 'Moveable Task',
        content: 'Will be moved'
      });
      const createResponse = JSON.parse(result.content[0].text);
      const taskId = createResponse.task.id;

      // Move to in-progress
      result = await handler.callMCPTool('update_task', {
        taskId,
        lane: 'backlog',
        newLane: 'in-progress'
      });
      const moveResponse = JSON.parse(result.content[0].text);
      expect(moveResponse.success).toBe(true);
      expect(moveResponse.task.lane).toBe('in-progress');

      // Verify task is now in in-progress lane
      result = await handler.callMCPTool('get_lane_tasks', { lane: 'in-progress' });
      const tasksResponse = JSON.parse(result.content[0].text);
      const movedTask = tasksResponse.tasks.find(t => t.id === taskId);
      expect(movedTask).toBeDefined();
      expect(movedTask.content).toContain('Moveable Task');
    });

    test('should list all tasks across lanes', async () => {
      // Create tasks in different lanes
      await handler.callMCPTool('create_task', {
        lane: 'backlog',
        title: 'Backlog Task',
        content: 'In backlog'
      });
      
      await handler.callMCPTool('create_task', {
        lane: 'in-progress',
        title: 'Progress Task',
        content: 'In progress'
      });

      // List all tasks
      const result = await handler.callMCPTool('list_all_tasks', {});
      const response = JSON.parse(result.content[0].text);
      
      expect(response.tasks.length).toBeGreaterThanOrEqual(3); // Including setup task
      const backlogTask = response.tasks.find(t => t.content.includes('Backlog Task'));
      const progressTask = response.tasks.find(t => t.content.includes('Progress Task'));
      
      expect(backlogTask).toBeDefined();
      expect(progressTask).toBeDefined();
      expect(backlogTask.lane).toBe('backlog');
      expect(progressTask.lane).toBe('in-progress');
    });
  });
}); 