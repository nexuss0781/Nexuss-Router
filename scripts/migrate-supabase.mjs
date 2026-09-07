import fs from 'node:fs/promises';
import process from 'node:process';
import pg from 'pg';

const rawConnectionString = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!rawConnectionString || !/^postgres(ql)?:\/\//.test(rawConnectionString)) {
  console.error('Missing a PostgreSQL connection string. Set SUPABASE_DB_URL (preferred) or POSTGRES_URL_NON_POOLING.');
  process.exit(2);
}
const parsedConnectionString = new URL(rawConnectionString);
parsedConnectionString.searchParams.delete('sslmode');
const connectionString = parsedConnectionString.toString();
const sql = await fs.readFile(new URL('../supabase/migrations/001_low_latency_gateway.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString, ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: false } });
const schemaVersion = 2;
try {
  await client.connect();
  const current = await client.query("select value from public.ai_meta where key = 'schema_version'").then((r) => Number(r.rows[0]?.value)).catch(() => NaN);
  if (Number.isFinite(current) && current >= schemaVersion) {
    console.log(`Supabase schema already at version ${current}. Nothing to do.`);
    process.exit(0);
  }
  await client.query('BEGIN');
  await client.query(sql);
  await client.query(
    `insert into public.ai_meta(key,value,updated_at) values ('schema_version', $1, now()) on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [String(schemaVersion)],
  );
  await client.query('COMMIT');
  console.log('Supabase low-latency migration applied successfully.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(`Supabase migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
