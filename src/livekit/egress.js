import { EgressClient, RoomCompositeOptions, EncodedFileOutput } from 'livekit-server-sdk';
import dotenv from 'dotenv';

dotenv.config();

const egressClient = new EgressClient(
    process.env.LIVEKIT_HOST, // wss://your-livekit-host
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
);

// TICKET 1: RoomComposite Egress (NOT TrackComposite)
export async function startAwarehouseStream(roomName, rtmpUrl) {
    // Custom layout hosted on Cloudflare Pages (or Railway static)
    const layoutUrl = process.env.EGRESS_LAYOUT_URL || 'https://verelo-layouts.vercel.app/ai-composite';

    const fileOutput = new EncodedFileOutput({
        fileType: 1, // MP4
        url: rtmpUrl, // RTMP endpoint (YouTube, Twitch, custom)
    });

    const options = new RoomCompositeOptions({
        layout: 'custom',
        customBaseUrl: layoutUrl, // Your HTML composite canvas
        audioOnly: false,
        videoOnly: false,
    });

    const egressInfo = await egressClient.startRoomCompositeEgress(
        roomName,
        fileOutput,
        options
    );

    console.log('[EGRESS] Started:', egressInfo.egressId);
    return egressInfo;
}

// Stop stream
export async function stopAwarehouseStream(egressId) {
    await egressClient.stopEgress(egressId);
    console.log('[EGRESS] Stopped:', egressId);
}