#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require('node:crypto');

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function createApiKey() {
  const prefix = crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(24).toString('base64url');
  const rawApiKey = `wapi_${prefix}_${secret}`;
  const keyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

  return {
    rawApiKey,
    keyPrefix: prefix,
    keyHash,
  };
}

function main() {
  const clientName = process.argv.slice(2).join(' ').trim();

  if (!clientName) {
    console.error('Usage: node scripts/provision-api-client.js "<client name>"');
    process.exit(1);
  }

  const { rawApiKey, keyPrefix, keyHash } = createApiKey();
  const insertSql =
    "insert into public.api_clients (name, key_prefix, key_hash, status) values " +
    `('${escapeSqlLiteral(clientName)}', '${keyPrefix}', '${keyHash}', 'active');`;

  console.log(
    JSON.stringify(
      {
        name: clientName,
        raw_api_key: rawApiKey,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        status: 'active',
        insert_sql: insertSql,
      },
      null,
      2,
    ),
  );
}

main();
