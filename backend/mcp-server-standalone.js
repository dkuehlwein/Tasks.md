#!/usr/bin/env node

/**
 * Standalone Tasks.md MCP Server using Official SDK
 * 
 * This file runs a standalone MCP server using the official @modelcontextprotocol/sdk
 * with stdio transport, making it compatible with langchain-mcp-adapters.
 * 
 * Usage:
 *   node mcp-server-standalone.js
 * 
 * Environment Variables:
 *   TASKS_DIR - Directory containing task files (default: ./tasks)
 *   CONFIG_DIR - Directory containing config files (default: ./config)
 */

const TasksMCPServerOfficial = require('./lib/mcp-server-official');

async function main() {
  try {
    // Set default environment variables if not provided
    process.env.TASKS_DIR = process.env.TASKS_DIR || './tasks';
    process.env.CONFIG_DIR = process.env.CONFIG_DIR || './config';
    process.env.BASE_PATH = process.env.BASE_PATH || '/';

    console.error(`🚀 Starting Tasks.md MCP Server (Official SDK)`);
    console.error(`📁 Tasks directory: ${process.env.TASKS_DIR}`);
    console.error(`⚙️  Config directory: ${process.env.CONFIG_DIR}`);
    
    // Create and run the MCP server
    const mcpServer = new TasksMCPServerOfficial();
    await mcpServer.run();
    
  } catch (error) {
    console.error("❌ Fatal error starting MCP server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the server
main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
}); 