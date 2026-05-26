import { readFileSync } from 'fs'
import { Client } from 'pg'

// Load .env.local manually
const envContent = readFileSync('.env.local', 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx < 0) continue
  process.env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
}

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('ERROR: Missing DATABASE_URL in .env.local')
  process.exit(1)
}

async function main() {
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    const result = await client.query<{ version: string }>('SELECT version()')
    console.log('PROOF 2 — Postgres direct connection: SUCCESS')
    console.log(result.rows[0].version)
  } finally {
    await client.end()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
