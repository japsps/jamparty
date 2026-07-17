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

    initroute(app) {
        this.logger.info(`Initializing routes...`);

        // Custom middleware to handle malformed JSON (single quotes) for carousel routes
        app.use('/carousel/v2/pages/:mode', (req, res, next) => {
            // Capture raw body manually (since we skipped the global parser)
            let rawBody = '';
            req.on('data', chunk => { rawBody += chunk; });
            req.on('end', () => {
                if (rawBody) {
                    let bodyString = rawBody;
                    // Remove surrounding single quotes if present
                    if (bodyString.startsWith("'") && bodyString.endsWith("'")) {
                        bodyString = bodyString.slice(1, -1);
                    }
                    try {
                        req.body = JSON.parse(bodyString);
                    } catch (e) {
                        this.logger.error(`Failed to parse carousel body: ${e.message}`);
                        this.logger.error(`Raw body was: ${rawBody}`);
                        return res.status(400).json({ error: 'Invalid JSON body' });
                    }
                } else {
                    req.body = {};
                }
                next();
            });
        });

        // Register routes
        this.registerPost(app, "/carousel/v2/pages/avatars", this.handleCarousel);
        this.registerPost(app, "/carousel/v2/pages/dancerprofile", this.handleCarousel);
        this.registerPost(app, "/carousel/v2/pages/jdtv", this.handleCarousel);
        this.registerPost(app, "/carousel/v2/pages/jdtv-nx", this.handleCarousel);
        this.registerPost(app, "/carousel/v2/pages/quests", this.handleCarousel);
        this.registerPost(app, "/carousel/v2/pages/:mode", this.handleCarouselPages);
        this.registerPost(app, "/carousel/v2/pages/upsell-videos", this.handleUpsellVideos);

        this.logger.info(`Routes initialized`);
    }

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

    handleUpsellVideos(req, res) {
        res.send(coreMain.upsellvideos);
    }
}

module.exports = new CarouselRouteHandler();
