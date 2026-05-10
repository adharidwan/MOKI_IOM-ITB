/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js');
const { runDueScheduledBlasts } = require('./scheduled-blast-runner.js');

const SCHEDULED_BLAST_POLL_INTERVAL_MS = Number(process.env.SCHEDULED_BLAST_POLL_INTERVAL_MS || 60000);
const SCHEDULED_BLAST_BATCH_LIMIT = Number(process.env.SCHEDULED_BLAST_BATCH_LIMIT || 5);

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSupabaseClient() {
  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function main() {
  const supabase = getSupabaseClient();
  let running = false;
  let stopped = false;

  const tick = async () => {
    if (running || stopped) {
      return;
    }

    running = true;
    try {
      await runDueScheduledBlasts(supabase, SCHEDULED_BLAST_BATCH_LIMIT);
    } catch (error) {
      console.error(`Failed to process scheduled blasts: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, Math.max(10000, SCHEDULED_BLAST_POLL_INTERVAL_MS));

  const shutdown = () => {
    stopped = true;
    clearInterval(timer);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`Scheduled blast worker started. Poll interval: ${Math.max(10000, SCHEDULED_BLAST_POLL_INTERVAL_MS)}ms.`);
  await tick();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
