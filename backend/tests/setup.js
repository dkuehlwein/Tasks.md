const fs = require('fs');
const path = require('path');

// Setup test environment
beforeAll(async () => {
  // Create test directories
  const testConfigDir = './tests/fixtures/config';
  const testTasksDir = './tests/fixtures/tasks';
  
  await fs.promises.mkdir(testConfigDir, { recursive: true });
  await fs.promises.mkdir(testTasksDir, { recursive: true });
  await fs.promises.mkdir(path.join(testConfigDir, 'sort'), { recursive: true });
  await fs.promises.mkdir(path.join(testConfigDir, 'images'), { recursive: true });
  
  // Create default test fixtures
  await fs.promises.writeFile(
    path.join(testConfigDir, 'tags.json'),
    JSON.stringify([
      { name: 'bug', backgroundColor: 'var(--color-alt-1)' },
      { name: 'feature', backgroundColor: 'var(--color-alt-2)' }
    ])
  );
  
  // Create test lanes
  await fs.promises.mkdir(path.join(testTasksDir, 'backlog'), { recursive: true });
  await fs.promises.mkdir(path.join(testTasksDir, 'in-progress'), { recursive: true });
  await fs.promises.mkdir(path.join(testTasksDir, 'done'), { recursive: true });
  
  // Create sample test tasks
  await fs.promises.writeFile(
    path.join(testTasksDir, 'backlog', 'test-task-1.md'),
    '# Test Task 1\n\nThis is a test task.\n\nTags: bug, feature'
  );
  
  await fs.promises.writeFile(
    path.join(testTasksDir, 'in-progress', 'test-task-2.md'),
    '# Test Task 2\n\nAnother test task.\n\nTags: feature'
  );

  // Create initial sort files
  await fs.promises.writeFile(
    path.join(testConfigDir, 'sort', 'lanes.json'),
    JSON.stringify(['backlog', 'in-progress', 'done'])
  );
  
  await fs.promises.writeFile(
    path.join(testConfigDir, 'sort', 'cards.json'),
    JSON.stringify([])
  );
});

// Cleanup after all tests
afterAll(async () => {
  try {
    await fs.promises.rm('./tests/fixtures', { recursive: true, force: true });
  } catch (error) {
    console.warn('Cleanup warning:', error.message);
  }
});

// Reset fixtures before each test
beforeEach(async () => {
  // Reset sort files only if they exist
  const testConfigDir = './tests/fixtures/config';
  const lanesPath = path.join(testConfigDir, 'sort', 'lanes.json');
  const cardsPath = path.join(testConfigDir, 'sort', 'cards.json');
  
  try {
    await fs.promises.writeFile(
      lanesPath,
      JSON.stringify(['backlog', 'in-progress', 'done'])
    );
    
    await fs.promises.writeFile(
      cardsPath,
      JSON.stringify([])
    );
  } catch (error) {
    // If files don't exist, create them
    await fs.promises.mkdir(path.dirname(lanesPath), { recursive: true });
    await fs.promises.writeFile(
      lanesPath,
      JSON.stringify(['backlog', 'in-progress', 'done'])
    );
    await fs.promises.writeFile(
      cardsPath,
      JSON.stringify([])
    );
  }
});

// Global test utilities
global.testUtils = {
  createTestTask: async (lane, name, content) => {
    const taskPath = path.join('./tests/fixtures/tasks', lane, `${name}.md`);
    await fs.promises.writeFile(taskPath, content);
    return taskPath;
  },
  
  deleteTestTask: async (lane, name) => {
    const taskPath = path.join('./tests/fixtures/tasks', lane, `${name}.md`);
    await fs.promises.rm(taskPath, { force: true });
  },
  
  readTestTask: async (lane, name) => {
    const taskPath = path.join('./tests/fixtures/tasks', lane, `${name}.md`);
    return fs.promises.readFile(taskPath, 'utf-8');
  }
}; 