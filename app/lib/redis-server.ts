import IORedis from 'ioredis';

let redisClient: IORedis | null = null;

function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

export function createRedisConnection(): IORedis {
  return new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
  });
}

export function getRedisClient(): IORedis {
  if (!redisClient) {
    redisClient = createRedisConnection();
  }

  return redisClient;
}
