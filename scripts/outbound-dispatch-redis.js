/* eslint-disable @typescript-eslint/no-require-imports */
const IORedis = require('ioredis');

const OUTBOUND_DISPATCH_QUEUE_NAME = 'outbound-dispatch';
const OUTBOUND_REDIS_KEY_PREFIX = 'outbound_dispatch';
const API_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const DECREMENT_COUNTER_LUA = `
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  if current <= 1 then
    redis.call('SET', KEYS[1], '0')
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
    return 0
  end

  local next = current - 1
  redis.call('SET', KEYS[1], tostring(next))
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
  return next
`;

function getRedisUrl() {
  return process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

function createRedisConnection() {
  return new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
  });
}

function buildSourcePendingCountKey(sourceType) {
  return `${OUTBOUND_REDIS_KEY_PREFIX}:source:${sourceType}:pending_count`;
}

function buildClientPendingCountKey(clientId) {
  return `${OUTBOUND_REDIS_KEY_PREFIX}:client:${clientId}:pending_count`;
}

async function decrementPendingOutboundCounts(redis, sourceType, clientId) {
  const keys = [buildSourcePendingCountKey(sourceType)];

  if (clientId) {
    keys.push(buildClientPendingCountKey(clientId));
  }

  await Promise.all(
    keys.map((key) => redis.eval(DECREMENT_COUNTER_LUA, 1, key, API_IDEMPOTENCY_TTL_SECONDS)),
  );
}

module.exports = {
  OUTBOUND_DISPATCH_QUEUE_NAME,
  createRedisConnection,
  decrementPendingOutboundCounts,
};
