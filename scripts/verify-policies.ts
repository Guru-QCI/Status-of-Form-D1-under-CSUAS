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
    const result = await client.query<{ schemaname: string; tablename: string; policyname: string; cmd: string }>(
      `SELECT schemaname, tablename, policyname, cmd
       FROM pg_policies
       WHERE schemaname = 'public'
       ORDER BY tablename, policyname`
    )
    console.log(`RLS policies in public schema (${result.rows.length} found):\n`)
    console.log(`${'tablename'.padEnd(25)} ${'policyname'.padEnd(35)} cmd`)
    console.log(`${'-'.repeat(25)} ${'-'.repeat(35)} ------`)
    result.rows.forEach(r =>
      console.log(`${r.tablename.padEnd(25)} ${r.policyname.padEnd(35)} ${r.cmd}`)
    )
  } finally {
    await client.end()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
