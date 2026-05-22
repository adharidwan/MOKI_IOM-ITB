/* eslint-disable @typescript-eslint/no-require-imports */
const os = require('os');
const qrcode = require('qrcode-terminal');
const { query } = require('./postgres-client.js');

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

async function upsertWhatsappInstance(payload) {
  await query(
    `
      insert into public.whatsapp_instances (
        id,
        label,
        status,
        last_known_phone_number,
        last_known_chat_id,
        last_ready_at,
        last_qr_at,
        last_disconnect_at,
        last_error,
        assigned_worker_id,
        updated_at,
        is_enabled,
        retired_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        coalesce($11::timestamptz, timezone('utc'::text, now())),
        coalesce($12::boolean, true),
        $13
      )
      on conflict (id) do update
      set label = excluded.label,
          status = excluded.status,
          last_known_phone_number = excluded.last_known_phone_number,
          last_known_chat_id = excluded.last_known_chat_id,
          last_ready_at = excluded.last_ready_at,
          last_qr_at = excluded.last_qr_at,
          last_disconnect_at = excluded.last_disconnect_at,
          last_error = excluded.last_error,
          assigned_worker_id = excluded.assigned_worker_id,
          updated_at = excluded.updated_at,
          is_enabled = coalesce($12::boolean, whatsapp_instances.is_enabled),
          retired_at = excluded.retired_at
    `,
    [
      payload.id,
      payload.label,
      payload.status,
      payload.last_known_phone_number || null,
      payload.last_known_chat_id || null,
      payload.last_ready_at || null,
      payload.last_qr_at || null,
      payload.last_disconnect_at || null,
      payload.last_error || null,
      payload.assigned_worker_id || null,
      payload.updated_at || null,
      payload.is_enabled,
      payload.retired_at || null,
    ],
  );
}

async function createWhatsappInstanceEvent(payload) {
  await query(
    `
      insert into public.whatsapp_instance_events (whatsapp_instance_id, event_type, message, metadata, created_at)
      values ($1, $2, $3, $4::jsonb, coalesce($5::timestamptz, timezone('utc'::text, now())))
    `,
    [
      payload.whatsapp_instance_id,
      payload.event_type,
      payload.message || null,
      JSON.stringify(payload.metadata || {}),
      payload.created_at || null,
    ],
  );
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
