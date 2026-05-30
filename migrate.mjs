import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new pg.Client({ 
  connectionString: process.env.DATABASE_URL 
});

await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS __migrations (
    name TEXT PRIMARY KEY,
    run_at TIMESTAMPTZ DEFAULT NOW()
  )
`);

const migrationsDir = path.join(__dirname, 'drizzle');
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  const { rows } = await client.query(
    'SELECT name FROM __migrations WHERE name = $1', [file]
  );
  if (rows.length > 0) {
    console.log(`Skipping (already run): ${file}`);
    continue;
  }
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  console.log(`Running migration: ${file}`);
  await client.query(sql);
  await client.query('INSERT INTO __migrations (name) VALUES ($1)', [file]);
}

await client.end();
console.log('Migration done');