/**
 * Default Route Handler for OpenParty
 * Handles default routes and game functionality
 */
const RouteHandler = require('./RouteHandler');
const requestCountry = require("request-country");
const settings = require('../../../settings.json');
const path = require('path');

// AWS SDK v3 Imports
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Backblaze B2 configuration – use environment variables for security
const BACKBLAZE_ENDPOINT = process.env.BACKBLAZE_ENDPOINT || 's3.us-east-005.backblazeb2.com';
const BACKBLAZE_BUCKET = process.env.BACKBLAZE_BUCKET;
const BACKBLAZE_KEY_ID = process.env.BACKBLAZE_KEY_ID;
const BACKBLAZE_APPLICATION_KEY = process.env.BACKBLAZE_APPLICATION_KEY;

// Initialize S3 client for Backblaze (V3 Syntax)
const s3 = new S3Client({
    endpoint: `https://${BACKBLAZE_ENDPOINT}`,
    credentials: {
        accessKeyId: BACKBLAZE_KEY_ID,
        secretAccessKey: BACKBLAZE_APPLICATION_KEY,
    },
    forcePathStyle: true, // Backblaze requires path-style routing
    region: 'us-east-1'   // AWS SDK v3 requires a region structure even for custom endpoints
});

const core = {
    main: require('../../var').main,
    generatePlaylist: require('../../lib/playlist').generatePlaylist,
    CloneObject: require('../../helper').CloneObject,
    loadJsonFile: require('../../helper').loadJsonFile,
    signer: require('../../lib/signUrl')
};
const ipResolver = require('../../lib/ipResolver');
const deployTime = Date.now();

class DefaultRouteHandler extends RouteHandler {
    constructor() {
        super('DefaultRouteHandler');
        
        // Load nohud list (only used as fallback if Backblaze fails)
        this.chunk = core.loadJsonFile('nohud/chunk.json', path.join(__dirname, '../../../database/data/nohud/chunk.json'));
        
        // Active users tracking
        this.activeUsers = {};
        
        // Bind handler methods to maintain 'this' context
        this.handlePackages = this.handlePackages.bind(this);
        this.handleSession = this.handleSession.bind(this);
        this.handleHome = this.handleHome.bind(this);
        this.handleAliases = this.handleAliases.bind(this);
        this.handlePlaylists = this.handlePlaylists.bind(this);
        this.handleCountry = this.handleCountry.bind(this);
        this.handleSubscription = this.handleSubscription.bind(this);
        this.handleQuests = this.handleQuests.bind(this);
        this.handleSessionQuest = this.handleSessionQuest.bind(this);
        this.handleItems = this.handleItems.bind(this);
        this.handleSkuConstants = this.handleSkuConstants.bind(this);
        this.handleDanceMachine = this.handleDanceMachine.bind(this);
        this.handleContentAuthorization = this.handleContentAuthorization.bind(this);
        this.handlePackagesV2 = this.handlePackagesV2.bind(this);
        this.handleComVideos = this.handleComVideos.bind(this);
        this.handlePing = this.handlePing.bind(this);
    }

    /**
     * Check if request is authorized
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     * @returns {boolean} Whether the request is authorized
     * @private
     */
    checkAuth(req, res) {
        const skuId = req.header('X-SkuId');
        const authHeader = req.header('Authorization');

        if (skuId) {
            if (!(skuId.startsWith("jd") || skuId.startsWith("JD")) || !authHeader?.startsWith("Ubi")) {
                res.status(400).send({
                    'error': 400,
                    'message': 'Bad request! Oops you didn\'t specify what file should we give you, try again'
                });
                return false;
            }
            return true;
        } else {
            res.status(400).send({
                'error': 400,
                'message': 'Oopsie! We can\'t check that ur Request is valid',
                'header': req.headers
            });
            return false;
        }
    }

    /**
     * Reset timeout for active user
     * @param {string} ip - User's IP address
     * @param {string} platform - User's platform
     * @private
     */
    resetTimeout(ip, platform) {
        if (this.activeUsers[ip]) {
            clearTimeout(this.activeUsers[ip].timeout);
        }
        this.activeUsers[ip] = {
            timestamp: Date.now(),
            platform: platform || null,
            timeout: setTimeout(() => {
                delete this.activeUsers[ip];
            }, 20 * 60 * 1000) // 20 minutes
        };
    }

    /**
     * Initialize the routes
     * @param {Express} app - The Express application instance
     */
    initroute(app) {
        console.log(`[ROUTE] ${this.name} initializing routes...`);

        // Package routes
        this.registerGet(app, "/packages/v1/sku-packages", this.handlePackages);
        this.registerPost(app, "/carousel/:version/packages", this.handlePackagesV2);

        // Session routes
        this.registerPost(app, "/sessions/v1/session", this.handleSession);

        // Home and profile routes
        this.registerPost(app, "/home/v1/tiles", this.handleHome);
        this.registerGet(app, "/aliasdb/v1/aliases", this.handleAliases);
        this.registerGet(app, "/playlistdb/v1/playlists", this.handlePlaylists);
        this.registerGet(app, "/profile/v2/country", this.handleCountry);

        // Subscription and quest routes
        this.registerGet(app, "/subscription/v1/refresh", this.handleSubscription);
        this.registerGet(app, "/questdb/v1/quests", this.handleQuests);
        this.registerGet(app, "/session-quest/v1/", this.handleSessionQuest);

        // Item and customization routes
        this.registerGet(app, "/customizable-itemdb/v1/items", this.handleItems);
        this.registerGet(app, "/constant-provider/v1/sku-constants", this.handleSkuConstants);
        this.registerGet(app, "/dance-machine/v1/blocks", this.handleDanceMachine);

        // Content authorization route – this will now generate signed URLs on the fly
        this.registerGet(app, "/content-authorization/v1/maps/*", this.handleContentAuthorization);

        // Video routes
        this.registerGet(app, "/com-video/v1/com-videos-fullscreen", this.handleComVideos);

        // Status route
        this.registerGet(app, "/status/v1/ping", this.handlePing);

        console.log(`[ROUTE] ${this.name} routes initialized`);
    }

    /**
     * Handle package requests – returns signed URLs for map content from Backblaze B2
     * Uses platform-specific file naming: maps/{MapName}/{mapNameLower}_main_scene_{platform}.zip
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    async handlePackages(req, res) {
        if (!this.checkAuth(req, res)) return;

        const skuId = req.header('X-SkuId');
        const skuPackages = core.main.skupackages;
        const platforms = ['wiiu', 'nx', 'pc', 'durango', 'orbis'];

        // 1. Determine the platform from the skuId
        let platform = null;
        for (const p of platforms) {
            if (skuId.includes(p)) {
                platform = p;
                break;
            }
        }
        if (!platform) {
            return res.status(400).send('Unsupported platform');
        }

        // 2. Get the static package list for this platform
        let platformPackages = skuPackages[platform];
        if (!platformPackages) {
            return res.status(400).send('No packages for this platform');
        }

        // 3. Clone to avoid mutating the cached version
        const signedPackages = { ...platformPackages };

        // 4. Iterate over each map entry (keys ending with '_mapContent')
        for (const [key, value] of Object.entries(signedPackages)) {
            if (key.endsWith('_mapContent')) {
                const mapName = key.replace('_mapContent', ''); // e.g., "JDCGeeBETA"
                const mapNameLower = mapName.toLowerCase();    // e.g., "jdcgeebeta"

                // Build the S3 key according to your bucket structure
                const fileKey = `maps/${mapName}/${mapNameLower}_main_scene_${platform}.zip`;

                try {
                    // Create AWS SDK v3 command
                    const command = new GetObjectCommand({
                        Bucket: BACKBLAZE_BUCKET,
                        Key: fileKey
                    });
                    
                    // Generate presigned URL (expires in 8 minutes / 480 seconds)
                    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 480 });
                    
                    // Replace the static URL with the signed one
                    value.url = signedUrl;
                } catch (error) {
                    if (this.logger) {
                        this.logger.error(`Failed to generate signed URL for ${mapName} (${platform}): ${error.message}`);
                    } else {
                        console.error(`Failed to generate signed URL for ${mapName} (${platform}):`, error);
                    }
                }
            }
        }

        res.send(signedPackages);
    }

    /**
     * Handle session requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handleSession(req, res) {
        res.send({
            "pairingCode": "000000",
            "sessionId": "00000000-0000-0000-0000-000000000000",
            "docId": "0000000000000000000000000000000000000000"
        });
    }

    /**
     * Handle home requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handleHome(req, res) {
        res.send(core.main.home);
    }

    /**
     * Handle aliases requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handleAliases(req, res) {
        res.send(core.main.aliases);
    }

    /**
     * Handle playlists requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handlePlaylists(req, res) {
        res.send(core.generatePlaylist().playlistdb);
    }

    /**
     * Handle country requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handleCountry(req, res) {
        let country = requestCountry(req);
        if (country == false) {
            country = "US";
        }
        res.send({ "country": country });
    }

    /**
     * Handle subscription requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handleSubscription(req, res) {
        res.send(core.main.subscription);
    }

    /**
     * Handle quests requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handleQuests(req, res) {
        const sku = req.header('X-SkuId');
        if (sku && sku.startsWith('jd2017-nx-all')) {
            res.send(core.main.questsnx);
        } else {
            res.send(core.main.questspc);
        }
    }

    /**
     * Handle session quest requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handleSessionQuest(req, res) {
        res.send({
            "__class": "SessionQuestService::QuestData",
            "newReleases": []
        });
    }

    /**
     * Handle items requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handleItems(req, res) {
        res.send(core.main.items);
    }

    /**
     * Handle SKU constants requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handleSkuConstants(req, res) {
        res.send(core.main.block);
    }

    /**
     * Handle dance machine requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handleDanceMachine(req, res) {
        const skuId = req.header('X-SkuId');
        if (skuId.includes("pc")) {
            res.send(core.main.dancemachine_pc);
        } else if (skuId.includes("nx")) {
            res.send(core.main.dancemachine_nx);
        } else {
            res.send('Invalid Game');
        }
    }

    /**
     * Handle content authorization requests – generates signed URLs from Backblaze B2 on the fly.
     * This replaces the static chunk.json lookup with dynamic, secure URLs.
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    async handleContentAuthorization(req, res) {
        if (!this.checkAuth(req, res)) return;

        // Extract map name from URL
        const mapName = req.url.split('/').pop();

        // Determine quality (default to HIGH if not provided)
        const quality = req.query.quality || 'ULTRA';

        // Build the S3 key – adjust folder structure to match your bucket
        const fileKey = `maps/${mapName}/${mapName}_${quality}.webm`;

        try {
            // Create AWS SDK v3 Command
            const command = new GetObjectCommand({
                Bucket: BACKBLAZE_BUCKET,
                Key: fileKey
            });

            // Generate signed URL valid for 8 minutes (480 seconds)
            const signedUrl = await getSignedUrl(s3, command, { expiresIn: 480 });

            // Construct response with all quality variations using the same signed URL
            const response = {
                __class: "ContentAuthorizationEntry",
                duration: 300,
                changelist: 466919,
                urls: {
                    [`jmcs://jd-contents/${mapName}/${mapName}_ULTRA.webm`]: signedUrl,
                    [`jmcs://jd-contents/${mapName}/${mapName}_HIGH.webm`]: signedUrl,
                    [`jmcs://jd-contents/${mapName}/${mapName}_MID.webm`]: signedUrl,
                    [`jmcs://jd-contents/${mapName}/${mapName}_LOW.webm`]: signedUrl,
                    [`jmcs://jd-contents/${mapName}/${mapName}.ogg`]: signedUrl.replace(/\.webm$/, '.ogg')
                }
            };
            res.send(response);
        } catch (error) {
            if (this.logger) {
                this.logger.error(`Failed to generate signed URL for ${mapName}: ${error.message}`);
            } else {
                console.error(`Failed to generate signed URL for ${mapName}:`, error);
            }
            
            // Fallback to static chunk.json if available
            if (this.chunk[mapName]) {
                const placeholder = core.CloneObject(require('../../../database/data/nohud/placeholder.json'));
                placeholder.urls = this.chunk[mapName];
                res.send(placeholder);
            } else {
                res.status(500).send('Failed to generate video URL');
            }
        }
    }

    /**
     * Handle packages v2 requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handlePackagesV2(req, res) {
        res.send(core.main.packages);
    }

    /**
     * Handle com videos requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handleComVideos(req, res) {
        res.send([]);
    }

    /**
     * Handle ping requests
     * @param {Request} req - The request object
     * @param {Response} res - The response object
     */
    handlePing(req, res) {
        const ip = ipResolver.getClientIp(req);
        const platform = req.header('X-SkuId') || "unknown";
        this.resetTimeout(ip, platform);
        res.send([]);
    }
}

// Export an instance of the route handler
module.exports = new DefaultRouteHandler();
