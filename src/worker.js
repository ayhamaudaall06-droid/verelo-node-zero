import { inQueue, outQueue } from './services/queue.js';
import db from './services/db.js';

await db.init();

async function processMessage(msg) {
  console.log(`[WORKER] Processing ${msg.id} from ${msg.from}`);
  
  const state = await db.getState(msg.from) || { 
    userId: msg.from, 
    lane: 'INTAKE', 
    step: 0, 
    context: {} 
  };
  
  console.log(`[WORKER] State: ${state.lane}, step ${state.step}`);
  
  const text = msg.text?.toLowerCase() || '';
  let event = 'UNKNOWN';
  
  if (text.includes('1') || text.includes('fast')) event = 'QUALIFY_FAST';
  else if (text.includes('2') || text.includes('guided')) event = 'QUALIFY_GUIDED';
  else if (text.includes('3') || text.includes('live')) event = 'QUALIFY_DEEP';
  
  console.log(`[WORKER] Event: ${event}`);
  
  // Generate reply
  const reply = generateReply(state, event);
  
  // 🚀 SEND THE REPLY BACK TO USER
  await outQueue.add({
    to: msg.from,
    type: 'text',
    body: reply,
    metadata: {
      messaging_product: 'whatsapp',
      to: msg.from,
      type: 'text',
      text: { body: reply }
    }
  });
  
  console.log(`[WORKER] ✅ Queued reply to ${msg.from}`);
}

function generateReply(state, event) {
  if (state.lane === 'INTAKE') {
    return "Welcome to Verelo 🎁\nChoose your path:\n1. Fast Lane (4 curated boxes)\n2. Guided Shopping (AI assisted)\n3. Live Stream (watch & buy)";
  }
  return "Processing...";
}

console.log('[WORKER] Inbound worker started');
inQueue.process(processMessage);
