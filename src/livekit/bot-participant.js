import { Room, RoomEvent, TrackSource } from 'livekit-client';
import { AccessToken } from 'livekit-server-sdk';

// TICKET 2: AI Guest Track Pattern
export class AIPresenterBot {
    constructor(roomName, apiKey, apiSecret) {
        this.roomName = roomName;
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.room = null;
        this.videoTrack = null;
    }

    async join() {
        // Generate bot token
        const token = new AccessToken(this.apiKey, this.apiSecret, {
            identity: 'AI_CoHost',
            name: 'AI Presenter',
        });
        token.addGrant({
            roomJoin: true,
            room: this.roomName,
            canPublish: true,
            canSubscribe: true
        });

        this.room = new Room();

        // TICKET 3: Room Metadata Listener (NOT DataChannel)
        this.room.on(RoomEvent.RoomMetadataChanged, (metadata) => {
            const state = JSON.parse(metadata);
            console.log('[AI BOT] Product changed:', state.activeSku);
            // Future: Switch AI prompt based on SKU
            this.updateAIPresentation(state);
        });

        await this.room.connect(process.env.LIVEKIT_WS_URL, token.toJwt());
        console.log('[AI BOT] Joined as participant');

        // Publish placeholder track (black video loop for now)
        // Future: Replace with ComfyUI/HeyGen video stream
        await this.publishPlaceholder();
    }

    async publishPlaceholder() {
        // Create empty canvas track (Track 2 for future AI)
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 1280, 720);

        const stream = canvas.captureStream(30);
        const videoTrack = stream.getVideoTracks()[0];

        await this.room.localParticipant.publishTrack(videoTrack, {
            source: TrackSource.ScreenShare, // Track 2: AI Track (using ScreenShare slot)
            name: 'AI_Video_Feed',
            simulcast: false
        });

        console.log('[AI BOT] Published placeholder video track');
    }

    updateAIPresentation(state) {
        // Future: Change AI behavior based on room metadata
        console.log('[AI BOT] Updating presentation for:', state.activeSku);
    }

    async leave() {
        await this.room.disconnect();
    }
}