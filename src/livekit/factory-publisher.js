import { Room, RoomEvent, TrackSource } from 'livekit-client';

export class FactoryPublisher {
    constructor(roomName, token) {
        this.room = new Room({
            adaptiveStream: true,
            dynacast: true,
        });
        this.roomName = roomName;
        this.token = token;
    }

    async connect() {
        await this.room.connect(process.env.LIVEKIT_WS_URL, this.token);
        console.log('[FACTORY] Connected');
    }

    async publishTracks() {
        // TICKET 2: Dual Track Pattern
        // Track 1: High-res Camera (Factory view)
        const cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1920, height: 1080, frameRate: 30 },
            audio: true
        });

        const cameraTrack = cameraStream.getVideoTracks()[0];
        const audioTrack = cameraStream.getAudioTracks()[0];

        await this.room.localParticipant.publishTrack(cameraTrack, {
            source: TrackSource.Camera,
            name: 'Factory_Camera_Main',
            simulcast: true
        });

        await this.room.localParticipant.publishTrack(audioTrack, {
            source: TrackSource.Microphone,
            name: 'Factory_Audio'
        });

        // Track 2: Screen Share slot (Reserved for AI overlay)
        // Currently empty/black, will be replaced by AI Bot Track 2
        // This ensures the Egress layout has a slot to composite AI over
        console.log('[FACTORY] Published Camera (Track 1) + Reserved AI slot (Track 2)');
    }

    async updateProductMetadata(sku) {
        // TICKET 3: Room Metadata via Server API (not DataChannel)
        // Call your backend to update room state
        await fetch('/api/livekit/room-metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomName: this.roomName,
                metadata: JSON.stringify({
                    activeSku: sku,
                    timestamp: Date.now(),
                    source: 'factory_scanner'
                })
            })
        });
    }
}