import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const dbUrl = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;

if (!dbUrl || !token) {
  console.error("TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not set in backend/.env");
  process.exit(1);
}

const httpUrl = dbUrl.replace('libsql://', 'https://') + '/v2/pipeline';

const schemaPath = path.join(__dirname, '../turso_schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');

// Strip full-line comments and split SQL into individual statements
const cleanedSql = schemaSql
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n');

const statements = cleanedSql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

async function run() {
  console.log(`Applying ${statements.length} statements to Turso at ${httpUrl}...`);

  const requests = statements.map(sql => ({
    type: 'execute',
    stmt: { sql }
  }));
  requests.push({ type: 'close' });

  const res = await fetch(httpUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`HTTP error ${res.status}:`, text);
    process.exit(1);
  }

  const json = await res.json();
  const errors = json.results?.filter(r => r.type === 'error') || [];
  if (errors.length > 0) {
    console.error('Errors executing schema:', JSON.stringify(errors, null, 2));
    process.exit(1);
  }

  console.log('✅ Turso schema and indexes applied successfully!');
}

run().catch(err => {
  console.error('Failed to run schema:', err);
  process.exit(1);
});
