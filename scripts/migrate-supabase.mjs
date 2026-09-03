import fs from 'node:fs/promises';
import process from 'node:process';
import pg from 'pg';

const connectionString = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!connectionString || !/^postgres(ql)?:\/\//.test(connectionString)) {
  console.error('Missing a PostgreSQL connection string. Set SUPABASE_DB_URL (preferred) or POSTGRES_URL_NON_POOLING.');
  process.exit(2);
}
const sql = await fs.readFile(new URL('../supabase/migrations/001_low_latency_gateway.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString, ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('Supabase low-latency migration applied successfully.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(`Supabase migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
