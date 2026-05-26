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
    const result = await client.query<{ schemaname: string; tablename: string; policyname: string }>(
      `SELECT schemaname, tablename, policyname
       FROM pg_policies
       WHERE schemaname = 'storage'
       LIMIT 5`
    )
    console.log(`Storage RLS policies (${result.rows.length} found):`)
    if (result.rows.length === 0) {
      console.log('  (none — storage schema accessible, no policies yet)')
    } else {
      console.log(`\n${'schemaname'.padEnd(10)} ${'tablename'.padEnd(15)} policyname`)
      console.log(`${'-'.repeat(10)} ${'-'.repeat(15)} ----------`)
      result.rows.forEach(r =>
        console.log(`${r.schemaname.padEnd(10)} ${r.tablename.padEnd(15)} ${r.policyname}`)
      )
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
