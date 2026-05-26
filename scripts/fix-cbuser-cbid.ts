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
    const r1 = await client.query(`
      UPDATE "AppUser"
      SET "cbId" = (SELECT id FROM "CB" WHERE name = 'Bureau Veritas Certification India Pvt. Ltd.')
      WHERE email = 'cb.user@bureauveritas.example.com'
    `)
    console.log(`cb.user@bureauveritas.example.com: ${r1.rowCount} row(s) updated`)

    const r2 = await client.query(`
      UPDATE "AppUser"
      SET "cbId" = (SELECT id FROM "CB" WHERE name = 'Test CB Beta')
      WHERE email = 'test.cb.beta@example.com'
    `)
    console.log(`test.cb.beta@example.com: ${r2.rowCount} row(s) updated`)

    const verify = await client.query<{ email: string; cbId: string | null }>(`
      SELECT email, "cbId" FROM "AppUser" WHERE role = 'CB_USER' ORDER BY email
    `)
    console.log('\nPost-fix CB_USER cbId state:')
    verify.rows.forEach(r => console.log(`  ${r.email.padEnd(45)} cbId: ${r.cbId ?? 'NULL'}`))
  } finally {
    await client.end()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
