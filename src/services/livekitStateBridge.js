import { RoomServiceClient } from 'livekit-server-sdk';

let roomService = null;

function getRoomService() {
  if (roomService) return roomService;
  const { LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_HOST || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error('[LiveKit Bridge] Missing env vars');
  }
  roomService = new RoomServiceClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  return roomService;
}

const BOX_THEMES = {
  trending: 'trending',
  factory: 'standard',
  limited: 'urgency',
  vault: 'exclusive'
};

export function getThemeForBox(boxType) {
  return BOX_THEMES[boxType] || 'standard';
}

export async function updateRoomProductState(roomName, productState) {
  const metadata = {
    active_product_id: productState.id,
    sku: productState.sku,
    box_type: productState.box_type,
    price: productState.price,
    currency: productState.currency || 'USD',
    inventory: productState.inventory,
    primary_media_url: productState.media_url,
    theme: getThemeForBox(productState.box_type),
    updated_at: Date.now()
  };

  const svc = getRoomService();
  
  try {
    await svc.updateRoomMetadata(roomName, JSON.stringify(metadata));
  } catch (err) {
    // Room doesn't exist yet — create it first
    if (err.status === 404 || err.message?.includes('does not exist')) {
      await svc.createRoom({ name: roomName });
      await svc.updateRoomMetadata(roomName, JSON.stringify(metadata));
    } else {
      throw err;
    }
  }
  
  console.log(`[LiveKit] Room "${roomName}" metadata → ${productState.id}`);
  return metadata;
}
