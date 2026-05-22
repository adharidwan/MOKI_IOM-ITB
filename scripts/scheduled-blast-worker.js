/* eslint-disable @typescript-eslint/no-require-imports */
const { closePool } = require('./postgres-client.js');
const { runDueScheduledBlasts } = require('./scheduled-blast-runner.js');

const SCHEDULED_BLAST_POLL_INTERVAL_MS = Number(process.env.SCHEDULED_BLAST_POLL_INTERVAL_MS || 60000);
const SCHEDULED_BLAST_BATCH_LIMIT = Number(process.env.SCHEDULED_BLAST_BATCH_LIMIT || 5);

async function main() {
  let running = false;
  let stopped = false;

  const tick = async () => {
    if (running || stopped) {
      return;
    }

    running = true;
    try {
      await runDueScheduledBlasts(SCHEDULED_BLAST_BATCH_LIMIT);
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
    void closePool();
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
