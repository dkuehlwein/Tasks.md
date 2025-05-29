// Set up environment variables for tests
process.env.NODE_ENV = 'test';
process.env.CONFIG_DIR = './tests/fixtures/config';
process.env.TASKS_DIR = './tests/fixtures/tasks';
process.env.BASE_PATH = '/';
process.env.PUID = '1000';
process.env.PGID = '1000';
process.env.PORT = '0'; // Use random port for tests
process.env.LOCAL_IMAGES_CLEANUP_INTERVAL = '0'; // Disable cleanup in tests

// Mock file system operations that require root privileges
jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    promises: {
      ...originalFs.promises,
      chown: jest.fn().mockResolvedValue(undefined) // Mock chown to avoid permission errors
    }
  };
}); 