/* eslint-disable @typescript-eslint/no-require-imports */
const { Pool } = require('pg');

let pool = null;

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getRequiredEnv('DATABASE_URL'),
    });
  }

  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  closePool,
  getPool,
  query,
};
