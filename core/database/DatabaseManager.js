const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { getSavefilePath } = require('../helper');
const Logger = require('../utils/logger');

const DB_PATH = path.join(getSavefilePath(), 'openparty.db');

class DatabaseManager {
    constructor() {
        this.logger = new Logger('DatabaseManager');
        if (DatabaseManager._instance) {
            this.logger.info('Returning existing instance.');
            return DatabaseManager._instance;
        }
        this._db = null;
        DatabaseManager._instance = this;
        this.logger.info('New instance created.');
    }

    static getInstance() {
        if (!DatabaseManager._instance) {
            DatabaseManager._instance = new DatabaseManager();
        }
        return DatabaseManager._instance;
    }

    initialize() {
        if (this._db) {
            this.logger.info('Database already initialized (this._db is set).');
            return Promise.resolve(this._db);
        }

        this.logger.info('Starting database initialization...');
        return new Promise((resolve, reject) => {
            this._db = new sqlite3.Database(DB_PATH, (err) => {
                if (err) {
                    this.logger.error('Error connecting to database:', err.message);
                    this._db = null;
                    reject(err);
                } else {
                    this.logger.info('Connected to the SQLite database. this._db is now set.');
                    this._db.serialize(() => {
                        // most_played
                        this._db.run(`CREATE TABLE IF NOT EXISTS most_played (
                            mapName TEXT PRIMARY KEY,
                            playCount INTEGER DEFAULT 0
                        )`, (err) => {
                            if (err) this.logger.error('Error creating most_played table:', err.message);
                        });

                        // leaderboard (full schema)
                        this._db.run(`CREATE TABLE IF NOT EXISTS leaderboard (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            mapName TEXT NOT NULL,
                            profileId TEXT NOT NULL,
                            username TEXT NOT NULL,
                            score INTEGER NOT NULL,
                            timestamp TEXT NOT NULL,
                            name TEXT,
                            gameVersion TEXT,
                            rank INTEGER,
                            avatar TEXT,
                            country TEXT,
                            platformId TEXT,
                            alias TEXT,
                            aliasGender INTEGER,
                            jdPoints INTEGER,
                            portraitBorder TEXT,
                            UNIQUE(mapName, profileId)
                        )`, (err) => {
                            if (err) this.logger.error('Error creating leaderboard table:', err.message);
                        });

                        // dotw (full schema)
                        this._db.run(`CREATE TABLE IF NOT EXISTS dotw (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            mapName TEXT NOT NULL,
                            profileId TEXT NOT NULL,
                            username TEXT NOT NULL,
                            score INTEGER NOT NULL,
                            timestamp TEXT NOT NULL,
                            weekNumber INTEGER NOT NULL,
                            gameVersion TEXT,
                            rank INTEGER,
                            name TEXT,
                            avatar TEXT,
                            country TEXT,
                            platformId TEXT,
                            alias TEXT,
                            aliasGender INTEGER,
                            jdPoints INTEGER,
                            portraitBorder TEXT,
                            UNIQUE(mapName, profileId, weekNumber)
                        )`, (err) => {
                            if (err) this.logger.error('Error creating dotw table:', err.message);
                        });

                        // user_profiles (with all columns, including userId)
                        this._db.run(`CREATE TABLE IF NOT EXISTS user_profiles (
                            profileId TEXT PRIMARY KEY,
                            userId TEXT,
                            username TEXT,
                            nickname TEXT,
                            name TEXT,
                            email TEXT,
                            password TEXT,
                            ticket TEXT,
                            alias TEXT,
                            aliasGender INTEGER,
                            avatar TEXT,
                            country TEXT,
                            platformId TEXT,
                            jdPoints INTEGER,
                            portraitBorder TEXT,
                            rank INTEGER,
                            scores TEXT,
                            favorites TEXT,
                            songsPlayed TEXT,
                            progression TEXT,
                            history TEXT,
                            skin TEXT,
                            diamondPoints INTEGER,
                            unlockedAvatars TEXT,
                            unlockedSkins TEXT,
                            unlockedAliases TEXT,
                            unlockedPortraitBorders TEXT,
                            wdfRank INTEGER,
                            stars INTEGER,
                            unlocks INTEGER,
                            populations TEXT,
                            inProgressAliases TEXT,
                            language TEXT,
                            firstPartyEnv TEXT,
                            syncVersions TEXT,
                            otherPids TEXT,
                            stats TEXT,
                            mapHistory TEXT,
                            createdAt TEXT,
                            updatedAt TEXT
                        )`, (err) => {
                            if (err) {
                                this.logger.error('Error creating user_profiles table:', err.message);
                                reject(err);
                            }
                        });

                        // config
                        this._db.run(`CREATE TABLE IF NOT EXISTS config (
                            key TEXT PRIMARY KEY,
                            value TEXT
                        )`, (err) => {
                            if (err) {
                                this.logger.error('Error creating config table:', err.message);
                                return reject(err);
                            }
                            this.logger.info('All tables created. Resolving initialize promise.');
                            resolve(this._db);
                        });
                    });
                }
            });
        });
    }

    getDb() {
        this.logger.info(`getDb() called. this._db is: ${this._db ? 'set' : 'null'}`);
        if (!this._db) {
            throw new Error('DatabaseManager: Database not initialized. Call initialize() first.');
        }
        return this._db;
    }
}

module.exports = DatabaseManager;
