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
    const cbCount   = await client.query<{ count: string }>('SELECT count(*) FROM "CB"')
    const userCount = await client.query<{ count: string }>('SELECT count(*) FROM "AppUser"')
    const mfrCount  = await client.query<{ count: string }>('SELECT count(*) FROM "Manufacturer"')

    console.log('── Row counts ───────────────────────────────')
    console.log(`CB:           ${cbCount.rows[0].count}  (expect 3)`)
    console.log(`AppUser:      ${userCount.rows[0].count}  (expect 4)`)
    console.log(`Manufacturer: ${mfrCount.rows[0].count}  (expect 1)`)

    const users = await client.query<{ email: string; role: string; cbId: string | null }>(
      `SELECT email, role, "cbId" FROM "AppUser" ORDER BY role`
    )
    console.log('\n── AppUser rows ────────────────────────────')
    console.log(`${'email'.padEnd(42)} ${'role'.padEnd(10)} cbId`)
    console.log(`${'-'.repeat(42)} ${'-'.repeat(10)} ----`)
    users.rows.forEach(r =>
      console.log(`${r.email.padEnd(42)} ${r.role.padEnd(10)} ${r.cbId ?? 'null'}`)
    )

    const cbs = await client.query<{ name: string; isNabcbAccredited: boolean }>(
      `SELECT name, "isNabcbAccredited" FROM "CB" ORDER BY name`
    )
    console.log('\n── CB rows ─────────────────────────────────')
    console.log(`${'name'.padEnd(48)} isNabcbAccredited`)
    console.log(`${'-'.repeat(48)} -----------------`)
    cbs.rows.forEach(r =>
      console.log(`${r.name.padEnd(48)} ${r.isNabcbAccredited}`)
    )
  } finally {
    await client.end()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
