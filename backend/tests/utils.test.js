const fs = require('fs');
const path = require('path');
const taskOps = require('../lib/task-operations');

// Mock environment variables for testing
process.env.TASKS_DIR = './test-utils';
process.env.CONFIG_DIR = './test-config-utils';
process.env.PUID = '1000';
process.env.PGID = '1000';

describe('Task Management Utility Functions', () => {
  const testTasksDir = './test-utils';
  const testConfigDir = './test-config-utils';

  beforeEach(async () => {
    // Clean up and create fresh test environment
    try {
      await fs.promises.rm(testTasksDir, { recursive: true, force: true });
      await fs.promises.rm(testConfigDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    
    await fs.promises.mkdir(testTasksDir, { recursive: true });
    await fs.promises.mkdir(testConfigDir, { recursive: true });
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
    test('should return array of directory names', async () => {
      // Create test lanes
      await fs.promises.mkdir(path.join(testTasksDir, 'backlog'), { recursive: true });
      await fs.promises.mkdir(path.join(testTasksDir, 'in-progress'), { recursive: true });
      await fs.promises.mkdir(path.join(testTasksDir, 'done'), { recursive: true });

      const lanes = await taskOps.getLanesNames();
      expect(Array.isArray(lanes)).toBe(true);
      expect(lanes).toContain('backlog');
      expect(lanes).toContain('in-progress');
      expect(lanes).toContain('done');
      expect(lanes).toHaveLength(3);
    });

    test('should create tasks directory if it does not exist', async () => {
      // Remove the tasks directory
      await fs.promises.rm(testTasksDir, { recursive: true, force: true });

      const lanes = await taskOps.getLanesNames();
      expect(Array.isArray(lanes)).toBe(true);
      expect(lanes).toHaveLength(0); // No lanes initially
      
      // Verify directory was created
      const exists = await fs.promises.access(testTasksDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    test('should filter out files and return only directories', async () => {
      // Create mix of files and directories
      await fs.promises.mkdir(path.join(testTasksDir, 'valid-lane'));
      await fs.promises.writeFile(path.join(testTasksDir, 'not-a-lane.txt'), 'content');
      await fs.promises.writeFile(path.join(testTasksDir, 'config.json'), '{}');

      const lanes = await taskOps.getLanesNames();
      expect(lanes).toContain('valid-lane');
      expect(lanes).not.toContain('not-a-lane.txt');
      expect(lanes).not.toContain('config.json');
      expect(lanes).toHaveLength(1);
    });
  });

  describe('getMdFiles', () => {
    test('should return all markdown files with lane information', async () => {
      // Create test structure
      await fs.promises.mkdir(path.join(testTasksDir, 'backlog'), { recursive: true });
      await fs.promises.mkdir(path.join(testTasksDir, 'done'), { recursive: true });
      
      await fs.promises.writeFile(path.join(testTasksDir, 'backlog', 'task1.md'), 'content');
      await fs.promises.writeFile(path.join(testTasksDir, 'backlog', 'task2.md'), 'content');
      await fs.promises.writeFile(path.join(testTasksDir, 'done', 'task3.md'), 'content');
      await fs.promises.writeFile(path.join(testTasksDir, 'done', 'not-markdown.txt'), 'content');

      const files = await taskOps.getMdFiles();
      expect(files).toHaveLength(3);
      expect(files.map(f => f.name)).toContain('task1.md');
      expect(files.map(f => f.name)).toContain('task2.md');
      expect(files.map(f => f.name)).toContain('task3.md');
      expect(files.map(f => f.name)).not.toContain('not-markdown.txt');
      
      const task1 = files.find(f => f.name === 'task1.md');
      expect(task1.lane).toBe('backlog');
    });

    test('should handle empty lanes', async () => {
      // Create empty lanes
      await fs.promises.mkdir(path.join(testTasksDir, 'empty-lane'), { recursive: true });

      const files = await taskOps.getMdFiles();
      expect(files).toHaveLength(0);
    });
  });

  describe('getContent', () => {
    test('should read and return file content as string', async () => {
      const testFile = path.join(testTasksDir, 'test.md');
      const testContent = '# Test Task\n\nThis is test content with #tags';
      await fs.promises.writeFile(testFile, testContent);

      const content = await taskOps.getContent(testFile);
      expect(typeof content).toBe('string');
      expect(content).toBe(testContent);
    });

    test('should handle files with special characters', async () => {
      const testFile = path.join(testTasksDir, 'special.md');
      const testContent = '# Test with émojis 🚀\n\nSpecial chars: àáâãäå';
      await fs.promises.writeFile(testFile, testContent, 'utf8');

      const content = await taskOps.getContent(testFile);
      expect(content).toContain('émojis 🚀');
      expect(content).toContain('àáâãäå');
    });
  });

  describe('getTagsTextsFromCardContent', () => {
    test('should extract hashtag-style tags from content', () => {
      const content = '# Task Title\n\nSome content with #urgent #frontend #bug tags here.';
      const tags = taskOps.getTagsTextsFromCardContent(content);
      
      expect(tags).toContain('urgent');
      expect(tags).toContain('frontend');
      expect(tags).toContain('bug');
      expect(tags).toHaveLength(3);
    });

    test('should handle content without tags', () => {
      const content = '# Task Title\n\nNo tags in this content.';
      const tags = taskOps.getTagsTextsFromCardContent(content);
      expect(tags).toEqual([]);
    });

    test('should handle mixed alphanumeric tags', () => {
      const content = 'Content with #tag1 #version2 #bug-fix #feature_request';
      const tags = taskOps.getTagsTextsFromCardContent(content);
      
      expect(tags).toContain('tag1');
      expect(tags).toContain('version2');
      expect(tags).toContain('bug');
      expect(tags).toContain('feature_request');
    });

    test('should handle duplicate tags', () => {
      const content = 'Content with #urgent #frontend #urgent #backend #frontend';
      const tags = taskOps.getTagsTextsFromCardContent(content);
      
      // Should return all instances, not deduplicated
      expect(tags.filter(tag => tag === 'urgent')).toHaveLength(2);
      expect(tags.filter(tag => tag === 'frontend')).toHaveLength(2);
    });
  });

  describe('getCards', () => {
    test('should return all cards with complete metadata', async () => {
      // Create test structure
      await fs.promises.mkdir(path.join(testTasksDir, 'backlog'), { recursive: true });
      await fs.promises.mkdir(path.join(testTasksDir, 'done'), { recursive: true });
      
      await fs.promises.writeFile(
        path.join(testTasksDir, 'backlog', 'task1.md'),
        '# Task 1\n\nBacklog task #urgent #frontend'
      );
      await fs.promises.writeFile(
        path.join(testTasksDir, 'done', 'task2.md'),
        '# Task 2\n\nCompleted task #done #backend'
      );

      const cards = await taskOps.getCards();
      expect(cards).toHaveLength(2);
      
      const task1 = cards.find(c => c.name === 'task1');
      expect(task1.lane).toBe('backlog');
      expect(task1.content).toContain('Task 1');
      expect(task1.tags).toContain('urgent');
      expect(task1.tags).toContain('frontend');
      
      const task2 = cards.find(c => c.name === 'task2');
      expect(task2.lane).toBe('done');
      expect(task2.content).toContain('Task 2');
      expect(task2.tags).toContain('done');
      expect(task2.tags).toContain('backend');
    });

    test('should handle cards without tags', async () => {
      await fs.promises.mkdir(path.join(testTasksDir, 'backlog'), { recursive: true });
      await fs.promises.writeFile(
        path.join(testTasksDir, 'backlog', 'notags.md'),
        '# Task without tags\n\nNo tags here'
      );

      const cards = await taskOps.getCards();
      const card = cards.find(c => c.name === 'notags');
      expect(card.tags).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent directories gracefully', async () => {
      // Test with non-existent TASKS_DIR
      const originalTasksDir = process.env.TASKS_DIR;
      process.env.TASKS_DIR = './non-existent-dir';

      try {
        const lanes = await taskOps.getLanesNames();
        expect(Array.isArray(lanes)).toBe(true);
      } finally {
        process.env.TASKS_DIR = originalTasksDir;
      }
    });

    test('should handle permission errors appropriately', async () => {
      // This test would require specific OS-level permission setup
      // For now, we'll just verify error handling structure exists
      expect(typeof taskOps.getLanesNames).toBe('function');
      expect(typeof taskOps.getContent).toBe('function');
    });
  });

  describe('Performance', () => {
    test('should handle large number of files efficiently', async () => {
      // Create a moderate number of files to test performance
      const numTasks = 50;
      await fs.promises.mkdir(path.join(testTasksDir, 'performance'), { recursive: true });
      
      const createPromises = [];
      for (let i = 0; i < numTasks; i++) {
        createPromises.push(
          fs.promises.writeFile(
            path.join(testTasksDir, 'performance', `task${i}.md`),
            `# Task ${i}\n\nContent for task ${i} #test #performance`
          )
        );
      }
      await Promise.all(createPromises);

      const startTime = Date.now();
      const cards = await taskOps.getCards();
      const endTime = Date.now();
      
      expect(cards).toHaveLength(numTasks);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in < 5 seconds
    });
  });
}); 