import aedes from 'aedes';
import { createServer } from 'net';
import msgpack from 'msgpack-lite';

const { pack, unpack } = msgpack;

const MSG_DESIGN_UPDATE = 0x01;
const MSG_FORGE_UPDATE = 0x02;
const MSG_CONFIRM_LOCK = 0x03;

class MqttBroker {
  constructor(stateMachine) {
    this.broker = aedes();
    this.stateMachine = stateMachine;
    this.port = 1883;
  }

  start() {
    const server = createServer(this.broker.handle);
    
    server.listen(this.port, '0.0.0.0', () => {
      console.log(`[MQTT] Broker on port ${this.port}`);
    });

    this.broker.on('client', (client) => {
      console.log(`[MQTT] Connected: ${client.id}`);
    });

    this.broker.on('publish', (packet, client) => {
      if (!client) return;
      if (packet.topic.startsWith('design/')) {
        this.handleDesignUpdate(packet);
      }
    });

    return server;
  }

  handleDesignUpdate(packet) {
    try {
      const data = unpack(packet.payload);
      if (data.t !== MSG_DESIGN_UPDATE) return;

      const forgePayload = pack({
        t: MSG_FORGE_UPDATE,
        s: data.s,
        c: data.c,
        m: data.m
      });

      this.broker.publish({
        topic: `forge/${data.s}`,
        payload: forgePayload,
        qos: 1
      });
    } catch (err) {
      console.error('[MQTT] Error:', err.message);
    }
  }
}

export { MqttBroker };
