# Tasks.md Backend

A modular Node.js backend for the Tasks.md kanban board application, built with Koa.js and featuring both REST API and MCP (Model Context Protocol) interfaces.

## Architecture

```
backend/
├── server.js              # Main web server with REST API routes
├── lib/
│   ├── task-operations.js  # Core task and lane management
│   ├── config-operations.js # Configuration and metadata
│   ├── mcp-http-handler.js # MCP HTTP bridge
│   └── mcp-server.js       # MCP server implementation
├── tests/                  # Test files
└── package.json
```

## Features

- **REST API** for web frontend communication
- **MCP Server** for AI assistant integration
- **File-based storage** using markdown files
- **Image management** with automatic cleanup
- **Tag system** for task categorization
- **Lane/card sorting** with persistent ordering

## API Endpoints

### Tasks/Cards
- `GET /api/cards` - Get all tasks
- `GET /api/lanes/:lane/cards` - Get tasks in a specific lane
- `GET /api/lanes/:lane/cards/:name` - Get specific task content
- `POST /api/cards` - Create new task
- `PUT /api/lanes/:lane/cards/:name` - Update task content
- `PATCH /api/lanes/:lane/cards/:name` - Move task to different lane
- `PATCH /api/lanes/:lane/cards/:name/rename` - Rename task
- `DELETE /api/lanes/:lane/cards/:name` - Delete task

### Lanes
- `GET /api/lanes` - Get all lanes with sorting
- `POST /api/lanes` - Create new lane
- `PATCH /api/lanes/:lane` - Rename lane
- `DELETE /api/lanes/:lane` - Delete lane and all tasks

### Configuration
- `GET /api/tags` - Get all tags (defined and used)
- `PUT /api/tags` - Save tags configuration
- `GET /api/title` - Get application title
- `GET /api/sort/lanes` - Get lane sorting order
- `PUT /api/lanes/sort` - Save lane sorting order
- `GET /api/sort/cards` - Get card sorting order
- `PUT /api/cards/sort` - Save card sorting order

### Media
- `POST /api/images` - Upload image
- `GET /api/images/:filename` - Serve image

### MCP
- `POST /mcp` - MCP protocol endpoint for AI assistants

## Environment Variables

```env
PORT=3001                           # Server port
TASKS_DIR=/path/to/tasks           # Directory for markdown files
CONFIG_DIR=/path/to/config         # Directory for configuration
BASE_PATH=/                        # Base path for routes
PUID=1000                          # File ownership user ID
PGID=1000                          # File ownership group ID
LOCAL_IMAGES_CLEANUP_INTERVAL=60   # Image cleanup interval (minutes)
```

## Setup

```bash
cd backend
npm install
npm start
```

## Recent Refactoring (2024)

### Overview
Eliminated code duplication between `server.js` and the `lib/` modules, improving maintainability and following DRY principles.

### Changes Made

#### 1. Enhanced `lib/task-operations.js`
**Added missing functions:**
- `deleteLane(laneId)` - Delete a lane and all its tasks
- `renameLane(oldLaneId, newLaneId)` - Rename a lane directory  
- `moveTask(taskId, fromLane, toLane)` - Move a task between lanes
- `renameTask(oldTaskId, newTaskId, lane)` - Rename a task file

**Benefits:**
- Centralized all task and lane operations
- Consistent error handling with try-catch blocks
- Proper file ownership management (PUID/PGID)
- Reusable functions for both web API and MCP server

#### 2. Created `lib/config-operations.js`
**New module for configuration management:**
- `getTags()` - Get all and used tags
- `saveTags(tags)` - Save tags configuration
- `getTitle()` - Get application title
- `getLanesSort()` / `saveLanesSort(sortData)` - Lane ordering
- `getCardsSort()` / `saveCardsSort(sortData)` - Card ordering  
- `saveImage(imageName, imageBuffer)` - Save uploaded images
- `removeUnusedImages()` - Cleanup unused image files

**Benefits:**
- Separated configuration logic from main server file
- Centralized file system operations for config files
- Consistent error handling and file permissions

#### 3. Refactored `server.js`
**Eliminated code duplication:**
- Removed ~200 lines of duplicate file system operations
- All route handlers now use modular functions from `lib/`
- Added proper error handling to all routes
- Cleaned up unused imports (`fs`, `uuid`, `PUID`, `PGID`)

**Before:** Each route handler had direct file system operations
**After:** Route handlers delegate to specialized modules

#### 4. Improved Error Handling
**Standardized error responses:**
- All route handlers now have try-catch blocks
- Consistent error response format: `{ error: error.message }`
- Proper HTTP status codes (500 for server errors)

### Code Reduction Results
- **server.js**: Reduced from 409 lines to 294 lines (-28%)
- **Total lines of duplicated code eliminated**: ~150 lines
- **New modular code**: ~200 lines in specialized modules

### Benefits Achieved

#### 1. **DRY Principle**
- Eliminated duplicate file system operations
- Single source of truth for task/lane/config operations
- Shared error handling patterns

#### 2. **Maintainability** 
- Changes to business logic only need to be made in one place
- Clear separation of concerns (web routes vs. business logic)
- Easier to test individual operations

#### 3. **Consistency**
- Standardized error handling across all operations
- Consistent file permission management
- Unified function signatures and return values

#### 4. **Reusability**
- Functions can be used by both web API and MCP server
- Easy to add new interfaces (CLI, different API versions)
- Modular functions can be unit tested independently

## Testing

```bash
npm test                    # Run test suite
npm run test:watch         # Run tests in watch mode
node -c server.js          # Syntax check
```

All core modules pass syntax validation:
- ✅ `server.js` - No syntax errors
- ✅ `lib/task-operations.js` - No syntax errors  
- ✅ `lib/config-operations.js` - No syntax errors

## Contributing

When adding new features:
1. **Task/Lane operations** → Add to `lib/task-operations.js`
2. **Configuration operations** → Add to `lib/config-operations.js` 
3. **Route handlers** → Keep minimal, delegate to lib functions
4. **Add error handling** → Use try-catch with standardized error responses
5. **File operations** → Always set proper ownership (PUID/PGID)

## MCP Integration

The backend includes an MCP (Model Context Protocol) server that allows AI assistants to interact with tasks. The MCP endpoint is available at `/mcp` and supports:

- Task creation and management
- Lane operations
- Tag management
- Content search and retrieval

For MCP client configuration, see the main project README. 