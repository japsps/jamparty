/**
 * OpenParty - Class-based entry point
 * This file serves as the entry point for the class-based version of OpenParty
 */

// Import dependencies
const settings = require('./settings.json');
const Server = require('./core/classes/Server');
const fs = require('fs');
const path = require('path');
const { getSavefilePath } = require('./core/helper');
const dbPath = path.join(getSavefilePath(), 'openparty.db');

if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('[DB] Removed old database to recreate schema.');
}

console.log(`[MAIN] Starting OpenParty with class-based architecture`);

// Create and start the server
const server = new Server(settings);
server.start();
