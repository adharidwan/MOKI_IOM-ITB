/* eslint-disable @typescript-eslint/no-require-imports */
const os = require('os');
const qrcode = require('qrcode-terminal');

const WHATSAPP_RUNTIME_TTL_SECONDS = 30;
const WHATSAPP_QR_TTL_SECONDS = 60;
const WHATSAPP_RECONNECT_WINDOW_SECONDS = 24 * 60 * 60;

function buildWhatsappRuntimeKey(instanceId) {
  return `whatsapp:instance:${instanceId}:runtime`;
}

function buildWhatsappQrKey(instanceId) {
  return `whatsapp:instance:${instanceId}:qr`;
}

function buildWhatsappHeartbeatKey(instanceId) {
  return `whatsapp:instance:${instanceId}:heartbeat`;
}

function buildWhatsappReconnectCountKey(instanceId) {
  return `whatsapp:instance:${instanceId}:reconnects_24h`;
}

function getWorkerId() {
  return process.env.WHATSAPP_WORKER_ID || `${os.hostname()}:${process.pid}`;
}

function getWorkerHost() {
  return process.env.HOSTNAME || os.hostname();
}

function getWorkerVersion() {
  return process.env.npm_package_version || process.env.APP_VERSION || 'dev';
}

function renderTerminalQr(qrCode) {
  let rendered = null;

  qrcode.generate(qrCode, { small: true }, (output) => {
    rendered = output;
  });

  return rendered;
}

async function publishWhatsappRuntime(redis, instanceId, payload) {
  const serialized = JSON.stringify(payload);
  await redis
    .multi()
    .set(buildWhatsappRuntimeKey(instanceId), serialized, 'EX', WHATSAPP_RUNTIME_TTL_SECONDS)
    .set(
      buildWhatsappHeartbeatKey(instanceId),
      payload.last_heartbeat_at || new Date().toISOString(),
      'EX',
      WHATSAPP_RUNTIME_TTL_SECONDS,
    )
    .exec();
}

async function publishWhatsappQr(redis, instanceId, qrCode, generatedAt) {
  await redis.set(
    buildWhatsappQrKey(instanceId),
    JSON.stringify({
      qr_code: qrCode,
      qr_terminal: renderTerminalQr(qrCode),
      generated_at: generatedAt,
    }),
    'EX',
    WHATSAPP_QR_TTL_SECONDS,
  );
}

async function clearWhatsappQr(redis, instanceId) {
  await redis.del(buildWhatsappQrKey(instanceId));
}

async function incrementReconnectCount(redis, instanceId) {
  const key = buildWhatsappReconnectCountKey(instanceId);
  const [[, count]] = await redis.multi().incr(key).expire(key, WHATSAPP_RECONNECT_WINDOW_SECONDS).exec();
  return Number(count) || 0;
}

async function getReconnectCount(redis, instanceId) {
  const rawValue = await redis.get(buildWhatsappReconnectCountKey(instanceId));
  return Number.parseInt(rawValue || '0', 10) || 0;
}

async function upsertWhatsappInstance(supabase, payload) {
  const { error } = await supabase.from('whatsapp_instances').upsert(payload);

  if (error) {
    throw new Error(`Failed to upsert WhatsApp instance: ${error.message}`);
  }
}

async function createWhatsappInstanceEvent(supabase, payload) {
  const { error } = await supabase.from('whatsapp_instance_events').insert(payload);

  if (error) {
    throw new Error(`Failed to create WhatsApp instance event: ${error.message}`);
  }
}

module.exports = {
  WHATSAPP_RUNTIME_TTL_SECONDS,
  WHATSAPP_QR_TTL_SECONDS,
  clearWhatsappQr,
  createWhatsappInstanceEvent,
  getReconnectCount,
  getWorkerHost,
  getWorkerId,
  getWorkerVersion,
  incrementReconnectCount,
  publishWhatsappQr,
  publishWhatsappRuntime,
  renderTerminalQr,
  upsertWhatsappInstance,
};
