/**
 * Core class for OpenParty
 * Handles routing and initialization
 */
const { main } = require('../var');
const { resolvePath } = require('../helper');
const PluginManager = require('./PluginManager');
const Router = require('./Router');
const ErrorHandler = require('./ErrorHandler');
const express = require('express');
const requestIp = require('../lib/ipResolver.js');
const Logger = require('../utils/logger');

class Core {
  constructor(settings) {
    this.settings = settings;
    this.pluginManager = new PluginManager();
    this.router = new Router();
    this.appInstance = null;
    this.logger = new Logger('CORE');
  }

  async init(app, express, server) {
    this.logger.info('Initializing core...');
    this.appInstance = app;
    
    const { initializeDatabase } = require('../database/sqlite');
    try {
        await initializeDatabase();
        this.logger.info('Database initialized successfully.');
    } catch (error) {
        this.logger.error('Failed to initialize database:', error);
        process.exit(1);
    }

    app.set('pluginManager', this.pluginManager);

    this.configureMiddleware(app);
    
    this.pluginManager.loadPlugins(this.settings.modules);
    this.pluginManager.initializePlugins(app, 'pre-load');
    this.initializeCoreRoutes(app);
    this.pluginManager.initializePlugins(app, 'init');
    this.configure404Handler(app);
    
    this.logger.info('Core initialized successfully');
  }

  configureMiddleware(app) {
    // Conditional JSON parser: skip carousel routes (handled manually)
    app.use((req, res, next) => {
        if (req.url.startsWith('/carousel')) {
            // Skip JSON parsing for carousel routes
            next();
        } else {
            // Apply JSON parser with raw body capture for other routes
            express.json({
                verify: (req, res, buf) => {
                    req.rawBody = buf.toString('utf8');
                }
            })(req, res, next);
        }
    });
    app.use(express.urlencoded({ extended: true }));
    app.use(requestIp.mw());
    app.use(ErrorHandler.createExpressErrorHandler());
  }

  initializeCoreRoutes(app) {
    try {
      try {
        this.router.loadAllHandlers().initializeRoutes(app);
        this.logger.info('Using class-based route handlers');
      } catch (err) {
        this.logger.error(`Error loading class-based route handlers: ${err.message}`);
        require('../route/rdefault').initroute(app);
        require('../route/account').initroute(app);
        require('../route/leaderboard').initroute(app);
        require('../route/ubiservices').initroute(app);
        this.logger.info('Using legacy route handlers');
      }
      this.logger.info('Core routes initialized');
    } catch (error) {
      this.logger.error(`Error initializing core routes: ${error.message}`);
    }
  }

  configure404Handler(app) {
    app.get('*', function(req, res) {
      res.status(404).send({
        'error': 404,
        'message': 'Path Not Recognized'
      });
    });
  }
}

module.exports = Core;
