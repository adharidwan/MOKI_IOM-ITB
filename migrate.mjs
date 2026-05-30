import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new pg.Client({ 
  connectionString: process.env.DATABASE_URL 
});

await client.connect();

const migrationsDir = path.join(__dirname, 'drizzle');
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  console.log(`Running migration: ${file}`);
  await client.query(sql);
}

await client.end();
console.log('Migration done');