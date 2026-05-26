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
    const count = await client.query<{ count: string }>('SELECT count(*) FROM "EmailWhitelist"')
    console.log(`EmailWhitelist rows: ${count.rows[0].count}  (expect 4)`)

    const rows = await client.query<{ email: string; role: string; cbId: string | null }>(
      `SELECT email, role, "cbId" FROM "EmailWhitelist" ORDER BY role`
    )
    console.log('\nemail                                      role       cbId')
    console.log('------------------------------------------ ---------- ----')
    rows.rows.forEach(r =>
      console.log(`${r.email.padEnd(42)} ${r.role.padEnd(10)} ${r.cbId ?? 'null'}`)
    )
  } finally {
    await client.end()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
