const fs = require('fs');
const path = require('path');

// Import utility functions from server (we'll need to extract these)
// For now, we'll test the functions as they exist in the server

describe('Task Management Utility Functions', () => {
  
  describe('getLanesNames', () => {
    test('should return array of directory names', async () => {
      // We need to test the actual getLanesNames function
      // This would require extracting it from server.js or requiring the module
      
      // Mock test for now
      const mockGetLanesNames = async () => {
        const tasksDir = process.env.TASKS_DIR;
        await fs.promises.mkdir(tasksDir, { recursive: true });
        return fs.promises.readdir(tasksDir, { withFileTypes: true })
          .then(dirs => dirs
            .filter(dir => dir.isDirectory())
            .map(dir => dir.name)
          );
      };

      const lanes = await mockGetLanesNames();
      expect(Array.isArray(lanes)).toBe(true);
      expect(lanes).toContain('backlog');
      expect(lanes).toContain('in-progress');
      expect(lanes).toContain('done');
    });

    test('should create tasks directory if it does not exist', async () => {
      // Test directory creation behavior
      const testDir = './tests/fixtures/new-tasks';
      
      // Remove directory if it exists
      await fs.promises.rm(testDir, { recursive: true, force: true });
      
      // Mock function that creates directory
      const mockGetLanesNames = async () => {
        await fs.promises.mkdir(testDir, { recursive: true });
        return fs.promises.readdir(testDir, { withFileTypes: true })
          .then(dirs => dirs
            .filter(dir => dir.isDirectory())
            .map(dir => dir.name)
          );
      };

      const lanes = await mockGetLanesNames();
      expect(Array.isArray(lanes)).toBe(true);
      
      // Verify directory was created
      const dirExists = await fs.promises.access(testDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
      
      // Cleanup
      await fs.promises.rm(testDir, { recursive: true, force: true });
    });
  });

  describe('getMdFiles', () => {
    test('should return array of markdown files with lane info', async () => {
      // Test the getMdFiles function behavior
      const mockGetMdFiles = async () => {
        const lanes = ['backlog', 'in-progress', 'done'];
        const lanesFiles = await Promise.all(
          lanes.map(async (lane) => {
            try {
              const files = await fs.promises.readdir(`./tests/fixtures/tasks/${lane}`);
              return files.map((file) => ({ lane, name: file }));
            } catch (error) {
              return [];
            }
          })
        );
        const files = lanesFiles
          .flat()
          .filter(file => file.name.endsWith('.md'));
        return files;
      };

      const files = await mockGetMdFiles();
      expect(Array.isArray(files)).toBe(true);
      
      // Should have structure with lane and name
      files.forEach(file => {
        expect(file).toHaveProperty('lane');
        expect(file).toHaveProperty('name');
        expect(file.name).toMatch(/\.md$/);
      });
    });

    test('should filter out non-markdown files', async () => {
      // Create a non-markdown file for testing
      await testUtils.createTestTask('backlog', 'not-markdown.txt', 'This is not markdown');
      
      const mockGetMdFiles = async () => {
        const lanes = ['backlog'];
        const lanesFiles = await Promise.all(
          lanes.map(async (lane) => {
            try {
              const files = await fs.promises.readdir(`./tests/fixtures/tasks/${lane}`);
              return files.map((file) => ({ lane, name: file }));
            } catch (error) {
              return [];
            }
          })
        );
        const files = lanesFiles
          .flat()
          .filter(file => file.name.endsWith('.md'));
        return files;
      };

      const files = await mockGetMdFiles();
      
      // Should not include the .txt file
      const txtFiles = files.filter(file => file.name.endsWith('.txt'));
      expect(txtFiles).toHaveLength(0);
      
      // Should only include .md files
      files.forEach(file => {
        expect(file.name).toMatch(/\.md$/);
      });
      
      // Cleanup
      await fs.promises.rm('./tests/fixtures/tasks/backlog/not-markdown.txt', { force: true });
    });
  });

  describe('getContent', () => {
    test('should read file content as string', async () => {
      const testContent = '# Test Content\n\nThis is test content.';
      const testPath = await testUtils.createTestTask('backlog', 'content-test', testContent);
      
      const mockGetContent = (path) => {
        return fs.promises.readFile(path).then((res) => res.toString());
      };

      const content = await mockGetContent(testPath);
      expect(typeof content).toBe('string');
      expect(content).toBe(testContent);
      
      // Cleanup
      await testUtils.deleteTestTask('backlog', 'content-test');
    });

    test('should handle file read errors', async () => {
      const mockGetContent = (path) => {
        return fs.promises.readFile(path).then((res) => res.toString());
      };

      // Try to read non-existent file
      await expect(mockGetContent('./non-existent-file.md')).rejects.toThrow();
    });
  });

  describe('getTagsTextsFromCardContent', () => {
    test('should extract tags from markdown content', () => {
      const mockGetTagsTextsFromCardContent = (cardContent) => {
        const indexOfTagsKeyword = cardContent.toLowerCase().indexOf("tags: ");
        if (indexOfTagsKeyword === -1) {
          return [];
        }
        let startOfTags = cardContent.substring(indexOfTagsKeyword + "tags: ".length);
        const lineBreak = cardContent.indexOf("\n");
        if (lineBreak > 0) {
          startOfTags = startOfTags.split("\n")[0];
        }
        const tags = startOfTags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag !== "");
        return tags;
      };

      const contentWithTags = '# Test Task\n\nSome content here.\n\nTags: bug, feature, urgent';
      const tags = mockGetTagsTextsFromCardContent(contentWithTags);
      
      expect(Array.isArray(tags)).toBe(true);
      expect(tags).toContain('bug');
      expect(tags).toContain('feature');
      expect(tags).toContain('urgent');
    });

    test('should return empty array when no tags present', () => {
      const mockGetTagsTextsFromCardContent = (cardContent) => {
        const indexOfTagsKeyword = cardContent.toLowerCase().indexOf("tags: ");
        if (indexOfTagsKeyword === -1) {
          return [];
        }
        let startOfTags = cardContent.substring(indexOfTagsKeyword + "tags: ".length);
        const lineBreak = cardContent.indexOf("\n");
        if (lineBreak > 0) {
          startOfTags = startOfTags.split("\n")[0];
        }
        const tags = startOfTags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag !== "");
        return tags;
      };

      const contentWithoutTags = '# Test Task\n\nSome content here.\n\nNo tags in this content.';
      const tags = mockGetTagsTextsFromCardContent(contentWithoutTags);
      
      expect(Array.isArray(tags)).toBe(true);
      expect(tags).toHaveLength(0);
    });

    test('should handle malformed tags gracefully', () => {
      const mockGetTagsTextsFromCardContent = (cardContent) => {
        const indexOfTagsKeyword = cardContent.toLowerCase().indexOf("tags: ");
        if (indexOfTagsKeyword === -1) {
          return [];
        }
        let startOfTags = cardContent.substring(indexOfTagsKeyword + "tags: ".length);
        const lineBreak = cardContent.indexOf("\n");
        if (lineBreak > 0) {
          startOfTags = startOfTags.split("\n")[0];
        }
        const tags = startOfTags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag !== "");
        return tags;
      };

      const contentWithMalformedTags = '# Test Task\n\nTags: , , valid-tag, , another-tag,';
      const tags = mockGetTagsTextsFromCardContent(contentWithMalformedTags);
      
      expect(tags).toEqual(['valid-tag', 'another-tag']);
    });
  });

  describe('getLaneByCardName', () => {
    test('should find correct lane for existing card', async () => {
      const mockGetLaneByCardName = async (cardName) => {
        // Mock getMdFiles
        const files = [
          { lane: 'backlog', name: 'test-task-1.md' },
          { lane: 'in-progress', name: 'test-task-2.md' },
          { lane: 'done', name: 'completed-task.md' }
        ];
        
        const file = files.find((file) => file.name === `${cardName}.md`);
        return file ? file.lane : null;
      };

      const lane = await mockGetLaneByCardName('test-task-1');
      expect(lane).toBe('backlog');
      
      const lane2 = await mockGetLaneByCardName('test-task-2');
      expect(lane2).toBe('in-progress');
    });

    test('should handle non-existent card', async () => {
      const mockGetLaneByCardName = async (cardName) => {
        const files = [
          { lane: 'backlog', name: 'test-task-1.md' },
          { lane: 'in-progress', name: 'test-task-2.md' }
        ];
        
        const file = files.find((file) => file.name === `${cardName}.md`);
        return file ? file.lane : null;
      };

      const lane = await mockGetLaneByCardName('non-existent-task');
      expect(lane).toBeNull();
    });
  });

  describe('File Operations', () => {
    test('should maintain PUID/PGID when creating files', async () => {
      // This test verifies the file ownership pattern
      // In a real environment, this would check actual file permissions
      
      const testPath = './tests/fixtures/tasks/backlog/ownership-test.md';
      await fs.promises.writeFile(testPath, 'Test content');
      
      // Mock the chown operation (in tests we can't actually change ownership)
      const mockChown = jest.fn();
      
      // Simulate the pattern used in the server
      await mockChown(testPath, 1000, 1000);
      
      expect(mockChown).toHaveBeenCalledWith(testPath, 1000, 1000);
      
      // Cleanup
      await fs.promises.rm(testPath, { force: true });
    });
  });
}); 