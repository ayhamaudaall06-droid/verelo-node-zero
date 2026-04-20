import NodeMediaServer from 'node-media-server';

class MediaServer {
  constructor() {
    this.config = {
      rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60
      },
      http: {
        port: 8000,
        allow_origin: '*'
      },
      trans: {
        ffmpeg: '/usr/local/bin/ffmpeg', // Will need actual path
        tasks: [
          {
            app: 'live',
            hls: true,
            hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
            dash: true,
            dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
          }
        ]
      }
    };
    
    this.nms = new NodeMediaServer(this.config);
  }

  start() {
    this.nms.run();
    
    this.nms.on('preConnect', (id, args) => {
      console.log('[NMS] RTMP Connect:', id, args);
    });
    
    this.nms.on('postPublish', (id, streamPath, args) => {
      console.log('[NMS] Stream Published:', streamPath);
      // Update database that stream is LIVE
    });
    
    this.nms.on('donePublish', (id, streamPath, args) => {
      console.log('[NMS] Stream Ended:', streamPath);
      // Update database that stream is OFFLINE
    });
    
    console.log('[NMS] Media Server started on RTMP port 1935, HTTP port 8000');
  }
}

export { MediaServer };
