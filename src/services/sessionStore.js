import redis from './queue.js';

const SESSION_TTL = 3600; // 1 hour

function sessionKey(phone) {
  return `whatsapp:session:${phone}`;
}

export async function getSession(phone) {
  const data = await redis.get(sessionKey(phone));
  return data ? JSON.parse(data) : {
    phone,
    box: [],
    lastIntent: null,
    lastProductId: null,
    history: [],
    createdAt: Date.now()
  };
}

export async function saveSession(phone, session) {
  session.updatedAt = Date.now();
  await redis.setEx(sessionKey(phone), SESSION_TTL, JSON.stringify(session));
}

export async function clearSession(phone) {
  await redis.del(sessionKey(phone));
}
