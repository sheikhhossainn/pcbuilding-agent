// Dumps the live catalog (read-only SELECT) to a JSON file so the stress harness can run offline.
// Usage: node tests/stress/snapshot.mjs <out.json>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '..', '.env') });

const out = process.argv[2];
if (!out) throw new Error('usage: node snapshot.mjs <out.json>');

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const res = await db.execute('SELECT site, category, name, price, url, in_stock, specs FROM components WHERE in_stock = 1');
const rows = res.rows.map((r) => ({
  site: r.site, category: r.category, name: r.name, price: Number(r.price),
  url: r.url, in_stock: Number(r.in_stock), specs: r.specs,
}));
fs.writeFileSync(out, JSON.stringify(rows));
const counts = {};
for (const r of rows) counts[`${r.site}/${r.category}`] = (counts[`${r.site}/${r.category}`] || 0) + 1;
console.log(rows.length, 'rows');
console.log(counts);
