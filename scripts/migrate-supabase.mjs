import fs from 'node:fs/promises';
import process from 'node:process';

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
if (!url || !key) {
  console.error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY');
  process.exit(2);
}
const sql = await fs.readFile(new URL('../supabase/migrations/001_low_latency_gateway.sql', import.meta.url), 'utf8');
const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  body: JSON.stringify({ sql }),
});
if (!response.ok) {
  console.error(`Supabase migration failed (${response.status}): ${await response.text()}`);
  process.exit(1);
}
console.log('Supabase low-latency migration applied successfully.');
