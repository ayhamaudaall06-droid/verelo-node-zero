import { outQueue } from './services/queue.js';
import axios from 'axios';

// WORKING TOKEN - Hardcoded because .env isn't loading
const TOKEN = 'EAAfFtx2GNpMBRbvxTHpRtSb6L4c9GP8EdAQykcz6ZCtZCasQeXSV92nHRZApGnUzkkUMADI9ou2qLyanoZCU1t6UZAT37r39ZCWxRKojdV7vvjVHhZBpOLPCSUrM4pBC7dPn4HCK8kSd1P9u95EX1NxPztyOIWo6CdIgho1dZBz4dSWSnR6HvmYDK3Y1OxckY2S5F4T5HguqFjLhmwlrnyvrAOmcxzkfotzkCiwpw9WmJLGEQGOf8MUV82AvJtugB7M8gaM57d2kIf2BAA2Va29ZCgZBZCtCcXVwxtupAGLAAZDZD';
const PHONE_ID = '1048473741688933';

const WHATSAPP_API = `https://graph.facebook.com/v18.0/${PHONE_ID}/messages`;
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

console.log('[DISPATCHER] Starting with hardcoded token...');

async function dispatch() {
  while (true) {
    const job = await outQueue.get();
    if (!job) {
      await new Promise(r => setTimeout(r, 100));
      continue;
    }
    
    console.log(`[DISPATCHER] Sending to ${job.to}: ${job.body.substring(0, 30)}...`);
    
    try {
      const response = await axios.post(WHATSAPP_API, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: job.to,
        type: 'text',
        text: { body: job.body }
      }, { headers: HEADERS });
      
      console.log(`[DISPATCHER] ✅ SENT! ID: ${response.data.messages?.[0]?.id}`);
    } catch (err) {
      console.error(`[DISPATCHER] ❌ FAILED:`, err.response?.data?.error?.message || err.message);
    }
  }
}

dispatch();
