/**
 * Carousel Route Handler for OpenParty
 * Handles carousel and related content routes
 */
const RouteHandler = require('./RouteHandler');
const CarouselService = require('../../services/CarouselService');
const coreMain = require('../../var').main;
const Logger = require('../../utils/logger');
const AccountService = require('../../services/AccountService');

class CarouselRouteHandler extends RouteHandler {
    constructor() {
        super('CarouselRouteHandler');
        this.logger = new Logger('CarouselRouteHandler');

        this.handleCarousel = this.handleCarousel.bind(this);
        this.handleCarouselPages = this.handleCarouselPages.bind(this);
        this.handleUpsellVideos = this.handleUpsellVideos.bind(this);
    }

    /**
     * Initialize the routes
     * @param {Express} app - The Express application instance
     */
    initroute(app) {
        this.logger.info(`Initializing routes...`);

        // --- Custom middleware for carousel to handle malformed JSON ---
        // This runs BEFORE the global JSON parser (which is bypassed for this route)
        app.use('/carousel/v2/pages/:mode', (req, res, next) => {
            // We already captured rawBody in Core.js using verify
            if (req.rawBody) {
                let bodyString = req.rawBody;
                // Remove surrounding single quotes if present (the game/proxy adds them)
                if (bodyString.startsWith("'") && bodyString.endsWith("'")) {
                    bodyString = bodyString.slice(1, -1);
                }
                try {
                    req.body = JSON.parse(bodyString);
                } catch (e) {
                    this.logger.error(`Failed to parse carousel body: ${e.message}`);
                    this.logger.error(`Raw body was: ${req.rawBody}`);
                    return res.status(400).json({ error: 'Invalid JSON body' });
                }
            } else {
                // Fallback if rawBody isn't captured (shouldn't happen)
                req.body = req.body || {};
            }
            next();
        });

        // Register routes (the global JSON parser is still used for other routes, but this route's body is already set)
        this.registerPost(app, "/carousel/v2/pages/avatars", this.handleCarousel);
        this.registerPost(app, "/carousel/v2/pages/dancerprofile", this.handleCarousel);
        this.registerPost(app, "/carousel/v2/pages/jdtv", this.handleCarousel);
        this.registerPost(app, "/carousel/v2/pages/jdtv-nx", this.handleCarousel);
        this.registerPost(app, "/carousel/v2/pages/quests", this.handleCarousel);
        this.registerPost(app, "/carousel/v2/pages/:mode", this.handleCarouselPages);
        this.registerPost(app, "/carousel/v2/pages/upsell-videos", this.handleUpsellVideos);

        this.logger.info(`Routes initialized`);
    }

    /**
     * Handle carousel requests for static data (avatars, dancerprofile, jdtv, quests)
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handleCarousel(req, res) {
        const path = req.path.split('/').pop();
        switch (path) {
            case 'avatars':
                res.send(coreMain.avatars);
                break;
            case 'dancerprofile':
                res.send(coreMain.dancerprofile);
                break;
            case 'jdtv':
            case 'jdtv-nx':
                res.send(coreMain.jdtv);
                break;
            case 'quests':
                res.send(coreMain.quests);
                break;
            default:
                res.status(404).send('Not found');
        }
    }

    /**
     * Handle carousel pages requests for dynamic content (party, sweat, challenges)
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    async handleCarouselPages(req, res) {
        let search = "";
        if (req.body.searchString && req.body.searchString != "") {
            search = req.body.searchString;
        } else if (req.body.searchTags && req.body.searchTags != undefined) {
            search = req.body.searchTags[0];
        }

        const profileId = req.query.profileId || await AccountService.findUserFromTicket(req.header('Authorization'));

        let action = null;
        let isPlaylist = false;

        switch (req.params.mode) {
            case "party":
            case "partycoop":
                action = "partyMap";
                break;
            case "sweat":
                action = "sweatMap";
                break;
            case "create-challenge":
                action = "create-challenge";
                break;
            case "jd2019-playlists":
            case "jd2020-playlists":
            case "jd2021-playlists":
            case "jd2022-playlists":
                isPlaylist = true;
                break;
        }

        if (isPlaylist) {
            return res.json(require('../../lib/playlist').generatePlaylist().playlistcategory);
        }

        if (action != null) {
            return res.send(await CarouselService.generateCarousel(search, action, profileId));
        }
        
        return res.json({});
    }

    /**
     * Handle upsell videos requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handleUpsellVideos(req, res) {
        res.send(coreMain.upsellvideos);
    }
}

module.exports = new CarouselRouteHandler();
