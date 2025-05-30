const fs = require('fs');
const path = require('path');
const taskOps = require('../lib/task-operations');

// Mock environment variables
process.env.TASKS_DIR = './test-tasks';
process.env.CONFIG_DIR = './test-config';
process.env.PUID = '1000';
process.env.PGID = '1000';

describe('Task Operations', () => {
  const testTasksDir = './test-tasks';
  const testConfigDir = './test-config';

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
    
    // Create test lanes
    await fs.promises.mkdir(path.join(testTasksDir, 'backlog'), { recursive: true });
    await fs.promises.mkdir(path.join(testTasksDir, 'in-progress'), { recursive: true });
    await fs.promises.mkdir(path.join(testTasksDir, 'done'), { recursive: true });
    
    // Create test tasks
    await fs.promises.writeFile(
      path.join(testTasksDir, 'backlog', 'task1.md'),
      '# Task 1\n\nThis is task 1 content #urgent #frontend'
    );
    await fs.promises.writeFile(
      path.join(testTasksDir, 'in-progress', 'task2.md'),
      '# Task 2\n\nThis is task 2 content #backend #api'
    );
    await fs.promises.writeFile(
      path.join(testTasksDir, 'done', 'task3.md'),
      '# Task 3\n\nCompleted task #testing #done'
    );
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

  describe('getLanesNames', () => {
    test('should return all lane names', async () => {
      const lanes = await taskOps.getLanesNames();
      expect(lanes).toContain('backlog');
      expect(lanes).toContain('in-progress');
      expect(lanes).toContain('done');
      expect(lanes).toHaveLength(3);
    });

    test('should return empty array for no lanes', async () => {
      await fs.promises.rm(testTasksDir, { recursive: true, force: true });
      const lanes = await taskOps.getLanesNames();
      expect(lanes).toEqual([]);
    });
  });

  describe('getMdFiles', () => {
    test('should return all markdown files', async () => {
      const files = await taskOps.getMdFiles();
      expect(files).toHaveLength(3);
      expect(files.map(f => f.name)).toContain('task1.md');
      expect(files.map(f => f.name)).toContain('task2.md');
      expect(files.map(f => f.name)).toContain('task3.md');
    });

    test('should include lane information', async () => {
      const files = await taskOps.getMdFiles();
      const task1 = files.find(f => f.name === 'task1.md');
      expect(task1.lane).toBe('backlog');
    });
  });

  describe('getContent', () => {
    test('should read file content', async () => {
      const filePath = path.join(testTasksDir, 'backlog', 'task1.md');
      const content = await taskOps.getContent(filePath);
      expect(content).toContain('Task 1');
      expect(content).toContain('task 1 content');
    });
  });

  describe('getTagsTextsFromCardContent', () => {
    test('should extract tags from content', () => {
      const content = '# Task\n\nContent with #urgent #frontend tags';
      const tags = taskOps.getTagsTextsFromCardContent(content);
      expect(tags).toContain('urgent');
      expect(tags).toContain('frontend');
      expect(tags).toHaveLength(2);
    });

    test('should return empty array for no tags', () => {
      const content = '# Task\n\nContent without tags';
      const tags = taskOps.getTagsTextsFromCardContent(content);
      expect(tags).toEqual([]);
    });
  });

  describe('getCards', () => {
    test('should return all cards with metadata', async () => {
      const cards = await taskOps.getCards();
      expect(cards).toHaveLength(3);
      
      const task1 = cards.find(c => c.name === 'task1');
      expect(task1.lane).toBe('backlog');
      expect(task1.content).toContain('Task 1');
      expect(task1.tags).toContain('urgent');
      expect(task1.tags).toContain('frontend');
    });
  });

  describe('getTasksFromLane', () => {
    test('should return tasks from specific lane', async () => {
      const tasks = await taskOps.getTasksFromLane('backlog');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task1');
      expect(tasks[0].lane).toBe('backlog');
      expect(tasks[0].content).toContain('Task 1');
    });

    test('should return empty array for non-existent lane', async () => {
      const tasks = await taskOps.getTasksFromLane('non-existent');
      expect(tasks).toEqual([]);
    });
  });

  describe('createTask', () => {
    test('should create new task with title and content', async () => {
      const result = await taskOps.createTask('backlog', 'New Task', 'Task content');
      
      expect(result.lane).toBe('backlog');
      expect(result.title).toBe('New Task');
      expect(result.content).toContain('# New Task');
      expect(result.content).toContain('Task content');
      expect(result.id).toBeDefined();
      
      // Verify file was created
      const filePath = result.path;
      const exists = await fs.promises.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    test('should create task with only title', async () => {
      const result = await taskOps.createTask('backlog', 'Title Only');
      
      expect(result.content).toBe('# Title Only\n\n');
    });

    test('should create lane if it does not exist', async () => {
      const result = await taskOps.createTask('new-lane', 'New Task', 'Content');
      
      expect(result.lane).toBe('new-lane');
      const laneExists = await fs.promises.access(path.join(testTasksDir, 'new-lane'))
        .then(() => true).catch(() => false);
      expect(laneExists).toBe(true);
    });
  });

  describe('updateTask', () => {
    test('should update task content', async () => {
      const result = await taskOps.updateTask('task1', { 
        lane: 'backlog', 
        content: '# Updated Task\n\nUpdated content' 
      });
      
      expect(result.content).toContain('Updated Task');
      expect(result.content).toContain('Updated content');
    });

    test('should move task between lanes', async () => {
      const result = await taskOps.updateTask('task1', { 
        lane: 'backlog', 
        newLane: 'in-progress' 
      });
      
      expect(result.lane).toBe('in-progress');
      
      // Verify file moved
      const oldPath = path.join(testTasksDir, 'backlog', 'task1.md');
      const newPath = path.join(testTasksDir, 'in-progress', 'task1.md');
      
      const oldExists = await fs.promises.access(oldPath).then(() => true).catch(() => false);
      const newExists = await fs.promises.access(newPath).then(() => true).catch(() => false);
      
      expect(oldExists).toBe(false);
      expect(newExists).toBe(true);
    });

    test('should find task without specifying lane', async () => {
      const result = await taskOps.updateTask('task1', { 
        content: '# Found and Updated\n\nContent' 
      });
      
      expect(result.content).toContain('Found and Updated');
      expect(result.lane).toBe('backlog');
    });

    test('should throw error for non-existent task', async () => {
      await expect(taskOps.updateTask('non-existent', { content: 'test' }))
        .rejects.toThrow('Task non-existent not found');
    });
  });

  describe('deleteTask', () => {
    test('should delete existing task', async () => {
      const result = await taskOps.deleteTask('task1', 'backlog');
      
      expect(result.success).toBe(true);
      expect(result.id).toBe('task1');
      
      // Verify file was deleted
      const filePath = path.join(testTasksDir, 'backlog', 'task1.md');
      const exists = await fs.promises.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    test('should find and delete task without specifying lane', async () => {
      const result = await taskOps.deleteTask('task2');
      
      expect(result.success).toBe(true);
      expect(result.id).toBe('task2');
    });

    test('should throw error for non-existent task', async () => {
      await expect(taskOps.deleteTask('non-existent'))
        .rejects.toThrow('Task non-existent not found');
    });
  });

  describe('getTaskContent', () => {
    test('should get task content with metadata', async () => {
      const result = await taskOps.getTaskContent('task1', 'backlog');
      
      expect(result.id).toBe('task1');
      expect(result.lane).toBe('backlog');
      expect(result.content).toContain('Task 1');
      expect(result.tags).toContain('urgent');
      expect(result.tags).toContain('frontend');
    });

    test('should find task without specifying lane', async () => {
      const result = await taskOps.getTaskContent('task2');
      
      expect(result.id).toBe('task2');
      expect(result.lane).toBe('in-progress');
    });

    test('should throw error for non-existent task', async () => {
      await expect(taskOps.getTaskContent('non-existent'))
        .rejects.toThrow('Task non-existent not found');
    });
  });

  describe('createLane', () => {
    test('should create new lane with given name', async () => {
      const result = await taskOps.createLane('test-lane');
      
      expect(result.id).toBe('test-lane');
      expect(result.path).toContain('test-lane');
      
      // Verify directory was created
      const exists = await fs.promises.access(path.join(testTasksDir, 'test-lane'))
        .then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    test('should generate UUID for lane without name', async () => {
      const result = await taskOps.createLane();
      
      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });
}); 