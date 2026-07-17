/**
 * Server class for OpenParty
 * Manages the HTTP server lifecycle
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const Core = require('./Core');
const Logger = require('../utils/logger');
const helper = require('./core/helper'); // Cleaned up and moved to the top

class Server {
  /**
   * Create a new server instance
   * @param {Object} settings - Server settings from settings.json
   */
  constructor(settings) {
    this.settings = settings;
    this.app = express();
    this.core = new Core(settings);
    this.port = settings.server.forcePort ? settings.server.port : process.env.PORT || settings.server.port;
    this.host = settings.server.isPublic ? '0.0.0.0' : '127.0.0.1';
    this.logger = new Logger('SERVER');
    
    // Set process title
    process.title = 'OpenParty | Custom Just Dance Unlimited Server';
  }

  /**
   * Start the server
   * @returns {http.Server} The HTTP server instance
   */
  async start() { // Made the start method async itself
    this.logger.info(`Starting OpenParty server...`);
    
    // 1. Handle DB schema recreation safely before boot
    // WARNING: Remove this block if you want data to persist between restarts!
    try {
      const dbPath = path.join(helper.getSavefilePath(), 'openparty.db');
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        this.logger.info('[DB] Removed old database to recreate schema.');
      }
    } catch (err) {
      this.logger.error(`Failed to handle database initialization: ${err.message}`);
    }

    // 2. Initialize Core logic BEFORE opening the network port
    // This avoids race conditions where requests hit an unconfigured Express app
    await this.core.init(this.app, express, this.server);
    
    // 3. Create and start the HTTP server
    this.server = this.app.listen(this.port, this.host, () => {
      this.logger.info(`Listening on ${this.host}:${this.port}`);
      this.logger.info(`Open panel to see more logs`);
      this.logger.info(`Running in ${process.env.NODE_ENV || 'development'} mode`);
    });
    
    // Handle server errors
    this.server.on('error', (error) => {
      this.logger.error(`Error starting server: ${error.message}`);
      process.exit(1);
    });
    
    // Handle process termination
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
    
    return this.server;
  }

  /**
   * Stop the server gracefully
   */
  stop() {
    this.logger.info(`Stopping server...`);
    
    if (this.server) {
      this.server.close(() => {
        this.logger.info(`Server stopped`);
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }
}

module.exports = Server;
