const logger = require("./core/logger.js");
const Package = require("../package.json");
const Context = require("./core/context.js");
const BaseSession = require("./session/base_session.js");
const NodeHttpServer = require("./server/http_server.js");
const NodeRtmpServer = require("./server/rtmp_server.js");
const NodeRecordServer = require("./server/record_server.js");
const NodeNotifyServer = require("./server/notify_server.js");

class NodeMediaServer {
  constructor(config) {
    logger.level = "debug";
    logger.info(`Node-Media-Server v${Package.version}`);
    logger.info(`Homepage: ${Package.homepage}`);
    logger.info(`License: ${Package.license}`);
    logger.info(`Author: ${Package.author}`);

    Context.config = config;
    this.httpServer = new NodeHttpServer();
    this.rtmpServer = new NodeRtmpServer();
    this.recordServer = new NodeRecordServer();
    this.notifyServer = new NodeNotifyServer();
  }
/**
   * Register event listener
   * @param {string} eventName - Name of the event
   * @param {(session:BaseSession)=>void} listener - Callback function
   * @returns {void}
   */
  on(eventName, listener) {
    Context.eventEmitter.on(eventName, listener);
  }

  /**
   * Setup API routes for stream monitoring
   * @returns {void}
   */
  setupApiRoutes() {
    if (this.httpServer && this.httpServer.expressApp) {
      this.httpServer.expressApp.get("/api/streams", (req, res) => {
        const streams = { live: {} };
        
        if (Context.sessions && Context.sessions.size > 0) {
          Context.sessions.forEach((session, id) => {
            if (session.isPublishing && session.publishStreamPath) {
              const pathParts = session.publishStreamPath.split("/");
              const app = pathParts[1] || "live";
              const streamKey = pathParts[2] || id;
              
              if (!streams.live[app]) {
                streams.live[app] = {};
              }
              
              streams.live[app][streamKey] = {
                publisher: {
                  app: app,
                  stream: streamKey,
                  clientId: id,
                  connectCreated: session.connectTime,
                  bytes: session.socket ? session.socket.bytesRead : 0,
                  ip: session.socket ? session.socket.remoteAddress : null,
                  audio: session.audioCodec || null,
                  video: session.videoCodec || null
                },
                subscribers: []
              };
            }
          });
        }
        
        res.json(streams);
      });
      
      logger.info("[API] Stream monitoring endpoint registered at /api/streams");
    }
  }

  /**
   * Start all servers
   * @returns {void}
   */
  run() {
    this.httpServer.run();
    this.rtmpServer.run();
    this.recordServer.run(); 
    this.notifyServer.run();
    this.setupApiRoutes();
  }
}

module.exports = NodeMediaServer;
