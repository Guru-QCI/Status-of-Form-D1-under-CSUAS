import { readFileSync } from 'fs'
import { Client } from 'pg'

const envContent = readFileSync('.env.local', 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx < 0) continue
  process.env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) { console.error('ERROR: Missing DATABASE_URL in .env.local'); process.exit(1) }

async function main() {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const result = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name`
    )
    console.log(`Views in public schema (${result.rows.length} found):`)
    result.rows.forEach(r => console.log(' ', r.table_name))
  } finally {
    await client.end()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
