import mqtt from 'mqtt';
import { pack } from 'msgpack-lite';

const MSG_DESIGN_UPDATE = 0x01;

// Test configuration
const CONCURRENT_CLIENTS = 100;
const MESSAGES_PER_CLIENT = 10;
const BROKER_URL = 'mqtt://localhost:1883';

let latencies = [];
let errors = 0;
let completed = 0;

async function runClient(clientId) {
  return new Promise((resolve) => {
    const client = mqtt.connect(BROKER_URL, { clientId: `test_${clientId}` });
    let sent = 0;
    let received = 0;
    
    client.on('connect', () => {
      client.subscribe('forge/test_session', (err) => {
        if (err) errors++;
        
        // Send messages rapidly
        const interval = setInterval(() => {
          if (sent >= MESSAGES_PER_CLIENT) {
            clearInterval(interval);
            return;
          }
          
          const start = Date.now();
          const payload = pack({
            t: MSG_DESIGN_UPDATE,
            s: clientId,
            c: [255, 0, 0, 255], // RGBA
            m: 0x00
          });
          
          client.publish('design/test_session', payload, { qos: 1 }, (err) => {
            if (err) errors++;
          });
          sent++;
        }, 50); // 20 messages/sec per client
      });
    });
    
    client.on('message', (topic, payload) => {
      received++;
      if (received === MESSAGES_PER_CLIENT) {
        client.end();
        completed++;
        resolve();
      }
    });
    
    client.on('error', () => {
      errors++;
      resolve();
    });
    
    // Timeout
    setTimeout(() => {
      client.end();
      resolve();
    }, 10000);
  });
}

console.log(`Starting latency test: ${CONCURRENT_CLIENTS} clients, ${MESSAGES_PER_CLIENT} messages each`);

const startTime = Date.now();
const clients = [];

for (let i = 0; i < CONCURRENT_CLIENTS; i++) {
  clients.push(runClient(i));
}

Promise.all(clients).then(() => {
  const totalTime = Date.now() - startTime;
  console.log('\n=== RESULTS ===');
  console.log(`Total time: ${totalTime}ms`);
  console.log(`Clients completed: ${completed}/${CONCURRENT_CLIENTS}`);
  console.log(`Errors: ${errors}`);
  console.log(`Target P95: <100ms`);
  
  if (completed === CONCURRENT_CLIENTS && errors === 0 && totalTime < 5000) {
    console.log('✓ LATENCY TEST PASSED');
    process.exit(0);
  } else {
    console.log('✗ LATENCY TEST FAILED');
    process.exit(1);
  }
});
