/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('node:http');

const DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
const PORT = Number(process.env.WHATSAPP_ORCHESTRATOR_PORT || 3099);
const TOKEN = process.env.WHATSAPP_ORCHESTRATOR_TOKEN || '';
const BOT_IMAGE = process.env.WHATSAPP_BOT_IMAGE || 'iom4-bot:latest';
const BOT_NETWORK = process.env.WHATSAPP_BOT_NETWORK || '';
const MAX_CONTAINERS = Number(process.env.WHATSAPP_ORCHESTRATOR_MAX_CONTAINERS || 3);
const START_COOLDOWN_MS = Number(process.env.WHATSAPP_ORCHESTRATOR_START_COOLDOWN_MS || 30000);
const RESTART_COOLDOWN_MS = Number(process.env.WHATSAPP_ORCHESTRATOR_RESTART_COOLDOWN_MS || 60000);
const BOT_MEMORY_BYTES = parseMemoryBytes(process.env.WHATSAPP_BOT_MEMORY_LIMIT || '768m');
const BOT_NANO_CPUS = Math.floor(Number(process.env.WHATSAPP_BOT_CPUS || 1) * 1_000_000_000);
const INSTANCE_ID_PATTERN = /^[a-z0-9_-]+$/;
const lastLifecycleActionAt = new Map();

if (!TOKEN) {
  throw new Error('WHATSAPP_ORCHESTRATOR_TOKEN is required. Refusing to start without token auth.');
}

function parseMemoryBytes(value) {
  const rawValue = String(value || '').trim().toLowerCase();
  const match = rawValue.match(/^(\d+)([kmg])?b?$/);

  if (!match) {
    return 768 * 1024 * 1024;
  }

  const amount = Number(match[1]);
  const unit = match[2] || '';

  if (unit === 'g') {
    return amount * 1024 * 1024 * 1024;
  }

  if (unit === 'm') {
    return amount * 1024 * 1024;
  }

  if (unit === 'k') {
    return amount * 1024;
  }

  return amount;
}

function json(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function sanitizeInstanceId(instanceId) {
  const id = String(instanceId || '').trim();

  if (!INSTANCE_ID_PATTERN.test(id)) {
    const error = new Error('Invalid instance ID.');
    error.statusCode = 422;
    error.code = 'invalid_instance_id';
    throw error;
  }

  return id;
}

function containerNameFor(instanceId) {
  return `iom4_bot_${instanceId}`;
}

function authVolumeFor(instanceId) {
  return `iom4_bot_auth_${instanceId}`;
}

function dockerRequest(method, path, body) {
  const payload = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        socketPath: DOCKER_SOCKET_PATH,
        method,
        path,
        headers: payload
          ? {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (response) => {
        let raw = '';

        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          const parsed = raw ? safeJsonParse(raw) : null;
          resolve({ statusCode: response.statusCode || 0, body: parsed, raw });
        });
      },
    );

    request.on('error', reject);

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function requireAuth(request) {
  if (request.headers.authorization !== `Bearer ${TOKEN}`) {
    const error = new Error('Missing or invalid orchestrator token.');
    error.statusCode = 401;
    error.code = 'invalid_orchestrator_token';
    throw error;
  }
}

function assertCooldown(instanceId, action, cooldownMs) {
  const key = `${instanceId}:${action}`;
  const lastActionAt = lastLifecycleActionAt.get(key) || 0;
  const remainingMs = cooldownMs - (Date.now() - lastActionAt);

  if (remainingMs > 0) {
    const error = new Error(`Please wait ${Math.ceil(remainingMs / 1000)} seconds before ${action} again.`);
    error.statusCode = 429;
    error.code = 'lifecycle_action_cooldown';
    throw error;
  }

  lastLifecycleActionAt.set(key, Date.now());
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        error.statusCode = 422;
        error.code = 'invalid_json';
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function envArrayFor(instanceId, label) {
  const requiredEnv = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'REDIS_URL',
    'S3_ENDPOINT',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_BUCKET',
    'S3_REGION',
    'S3_FORCE_PATH_STYLE',
  ];
  const env = [
    `WHATSAPP_INSTANCE_ID=${instanceId}`,
    `WHATSAPP_INSTANCE_LABEL=${label}`,
    `WHATSAPP_WORKER_ID=${instanceId}-worker`,
    'WHATSAPP_CHROMIUM_PATH=/usr/bin/chromium',
    'NODE_ENV=production',
  ];

  requiredEnv.forEach((key) => {
    if (process.env[key]) {
      env.push(`${key}=${process.env[key]}`);
    }
  });

  return env;
}

function toContainerState(instanceId, inspectBody) {
  if (!inspectBody) {
    return {
      instance_id: instanceId,
      status: 'not_found',
      container_name: containerNameFor(instanceId),
      image: BOT_IMAGE,
      created_at: null,
      started_at: null,
      last_error: null,
    };
  }

  return {
    instance_id: instanceId,
    status: mapDockerStatus(inspectBody.State),
    container_name: String(inspectBody.Name || '').replace(/^\//, '') || containerNameFor(instanceId),
    image: inspectBody.Config?.Image || BOT_IMAGE,
    created_at: inspectBody.Created || null,
    started_at: inspectBody.State?.StartedAt || null,
    last_error: inspectBody.State?.Error || null,
  };
}

function mapDockerStatus(state) {
  if (!state) {
    return 'not_found';
  }

  if (state.Restarting) {
    return 'restarting';
  }

  if (state.Running) {
    return 'running';
  }

  if (state.Status === 'created') {
    return 'created';
  }

  if (state.Status === 'exited' || state.Status === 'dead') {
    return 'stopped';
  }

  return 'error';
}

async function inspectContainer(instanceId) {
  const name = containerNameFor(instanceId);
  const result = await dockerRequest('GET', `/containers/${encodeURIComponent(name)}/json`);

  if (result.statusCode === 404) {
    return null;
  }

  if (result.statusCode >= 400) {
    const error = new Error(result.body?.message || 'Failed to inspect container.');
    error.statusCode = 502;
    error.code = 'docker_inspect_failed';
    throw error;
  }

  return result.body;
}

async function listManagedContainers() {
  const filters = encodeURIComponent(JSON.stringify({
    label: ['iom4.kind=whatsapp-bot', 'iom4.managed=true'],
  }));
  const result = await dockerRequest('GET', `/containers/json?all=true&filters=${filters}`);

  if (result.statusCode >= 400) {
    const error = new Error(result.body?.message || 'Failed to list managed bot containers.');
    error.statusCode = 502;
    error.code = 'docker_list_failed';
    throw error;
  }

  return Array.isArray(result.body) ? result.body : [];
}

function getContainerNames(containerSummary) {
  return Array.isArray(containerSummary.Names)
    ? containerSummary.Names.map((name) => String(name).replace(/^\//, ''))
    : [];
}

async function assertContainerCreateAllowed(instanceId) {
  const containers = await listManagedContainers();
  const duplicates = containers.filter(
    (container) => container.Labels?.['iom4.whatsapp_instance_id'] === instanceId,
  );
  const expectedName = containerNameFor(instanceId);
  const unexpectedDuplicates = duplicates.filter(
    (container) => !getContainerNames(container).includes(expectedName),
  );

  if (unexpectedDuplicates.length) {
    const error = new Error(`Duplicate managed bot container exists for instance ${instanceId}.`);
    error.statusCode = 409;
    error.code = 'duplicate_instance_container';
    throw error;
  }

  if (containers.length >= MAX_CONTAINERS) {
    const error = new Error(`Maximum managed WhatsApp bot container limit reached (${MAX_CONTAINERS}).`);
    error.statusCode = 409;
    error.code = 'max_container_limit_reached';
    throw error;
  }
}

async function ensureContainer(instanceId, label) {
  const existing = await inspectContainer(instanceId);

  if (existing) {
    const duplicates = (await listManagedContainers()).filter(
      (container) =>
        container.Labels?.['iom4.whatsapp_instance_id'] === instanceId &&
        !getContainerNames(container).includes(containerNameFor(instanceId)),
    );

    if (duplicates.length) {
      const error = new Error(`Duplicate managed bot container exists for instance ${instanceId}.`);
      error.statusCode = 409;
      error.code = 'duplicate_instance_container';
      throw error;
    }

    return existing;
  }

  await assertContainerCreateAllowed(instanceId);

  const name = containerNameFor(instanceId);
  const volume = authVolumeFor(instanceId);
  const hostConfig = {
    Binds: [`${volume}:/app/.wwebjs_auth`],
    Memory: BOT_MEMORY_BYTES,
    NanoCpus: BOT_NANO_CPUS,
    RestartPolicy: { Name: 'unless-stopped' },
  };

  if (BOT_NETWORK) {
    hostConfig.NetworkMode = BOT_NETWORK;
  }

  const createResult = await dockerRequest(
    'POST',
    `/containers/create?name=${encodeURIComponent(name)}`,
    {
      Image: BOT_IMAGE,
      Env: envArrayFor(instanceId, label),
      HostConfig: hostConfig,
      Labels: {
        'iom4.managed': 'true',
        'iom4.kind': 'whatsapp-bot',
        'iom4.whatsapp_instance_id': instanceId,
        'iom4.created_by': 'whatsapp-orchestrator',
      },
    },
  );

  if (createResult.statusCode >= 400) {
    const error = new Error(createResult.body?.message || 'Failed to create bot container.');
    error.statusCode = 502;
    error.code = 'docker_create_failed';
    throw error;
  }

  return inspectContainer(instanceId);
}

async function startInstance(instanceId, label) {
  assertCooldown(instanceId, 'start', START_COOLDOWN_MS);
  await ensureContainer(instanceId, label);
  const result = await dockerRequest('POST', `/containers/${encodeURIComponent(containerNameFor(instanceId))}/start`);

  if (![204, 304].includes(result.statusCode)) {
    const error = new Error(result.body?.message || 'Failed to start bot container.');
    error.statusCode = 502;
    error.code = 'docker_start_failed';
    throw error;
  }

  return toContainerState(instanceId, await inspectContainer(instanceId));
}

async function stopInstance(instanceId) {
  const existing = await inspectContainer(instanceId);

  if (!existing) {
    return toContainerState(instanceId, null);
  }

  const result = await dockerRequest('POST', `/containers/${encodeURIComponent(containerNameFor(instanceId))}/stop?t=10`);

  if (![204, 304].includes(result.statusCode)) {
    const error = new Error(result.body?.message || 'Failed to stop bot container.');
    error.statusCode = 502;
    error.code = 'docker_stop_failed';
    throw error;
  }

  return toContainerState(instanceId, await inspectContainer(instanceId));
}

async function restartInstance(instanceId, label) {
  assertCooldown(instanceId, 'restart', RESTART_COOLDOWN_MS);
  await ensureContainer(instanceId, label);
  const result = await dockerRequest('POST', `/containers/${encodeURIComponent(containerNameFor(instanceId))}/restart?t=10`);

  if (result.statusCode !== 204) {
    const error = new Error(result.body?.message || 'Failed to restart bot container.');
    error.statusCode = 502;
    error.code = 'docker_restart_failed';
    throw error;
  }

  return toContainerState(instanceId, await inspectContainer(instanceId));
}

async function removeVolume(volumeName) {
  const result = await dockerRequest('DELETE', `/volumes/${encodeURIComponent(volumeName)}`);

  if (result.statusCode === 404) {
    return;
  }

  if (![204, 200].includes(result.statusCode)) {
    const error = new Error(result.body?.message || 'Failed to remove bot auth volume.');
    error.statusCode = 502;
    error.code = 'docker_volume_remove_failed';
    throw error;
  }
}

async function removeInstance(instanceId) {
  const existing = await inspectContainer(instanceId);
  const name = containerNameFor(instanceId);

  if (existing) {
    const result = await dockerRequest('DELETE', `/containers/${encodeURIComponent(name)}?force=true&v=false`);

    if (![204, 404].includes(result.statusCode)) {
      const error = new Error(result.body?.message || 'Failed to remove bot container.');
      error.statusCode = 502;
      error.code = 'docker_container_remove_failed';
      throw error;
    }
  }

  await removeVolume(authVolumeFor(instanceId));

  return toContainerState(instanceId, null);
}

function matchRoute(method, pathname) {
  const match = pathname.match(/^\/instances\/([a-z0-9_-]+)\/(container|start|stop|restart|remove)$/);

  if (!match) {
    return null;
  }

  const action = match[2];
  if (action === 'container' && method !== 'GET') {
    return null;
  }

  if (action !== 'container' && method !== 'POST') {
    return null;
  }

  return { instanceId: match[1], action };
}

async function handleRequest(request, response) {
  try {
    if (request.url === '/health') {
      json(response, 200, { ok: true });
      return;
    }

    requireAuth(request);
    const url = new URL(request.url, 'http://localhost');
    const route = matchRoute(request.method, url.pathname);

    if (!route) {
      json(response, 404, { error: { code: 'not_found', message: 'Route not found.' } });
      return;
    }

    const instanceId = sanitizeInstanceId(route.instanceId);

    if (route.action === 'container') {
      json(response, 200, toContainerState(instanceId, await inspectContainer(instanceId)));
      return;
    }

    const body = await readRequestJson(request);
    const label = String(body.label || instanceId).trim() || instanceId;

    if (route.action === 'start') {
      json(response, 200, await startInstance(instanceId, label));
      return;
    }

    if (route.action === 'stop') {
      json(response, 200, await stopInstance(instanceId));
      return;
    }

    if (route.action === 'remove') {
      json(response, 200, await removeInstance(instanceId));
      return;
    }

    json(response, 200, await restartInstance(instanceId, label));
  } catch (error) {
    json(response, error.statusCode || 500, {
      error: {
        code: error.code || 'orchestrator_error',
        message: error.message || 'Unexpected orchestrator error.',
      },
    });
  }
}

http.createServer((request, response) => {
  void handleRequest(request, response);
}).listen(PORT, () => {
  console.log(`WhatsApp orchestrator listening on ${PORT}`);
});
