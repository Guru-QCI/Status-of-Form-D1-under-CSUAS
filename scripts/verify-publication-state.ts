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
    const pub = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename`
    )
    console.log(`Tables in supabase_realtime publication (${pub.rows.length} found):`)
    if (pub.rows.length === 0) {
      console.log('  (none)')
    } else {
      pub.rows.forEach(r => console.log(`  ${r.tablename}`))
    }

    const rep = await client.query<{ relname: string; relreplident: string }>(
      `SELECT relname, relreplident FROM pg_class WHERE relname = 'Application'`
    )
    console.log('\nREPLICA IDENTITY for Application:')
    if (rep.rows.length === 0) {
      console.log('  (table not found in pg_class)')
    } else {
      const map: Record<string, string> = { d: 'default', f: 'full', i: 'index', n: 'nothing' }
      rep.rows.forEach(r =>
        console.log(`  relname: ${r.relname}  relreplident: ${r.relreplident} (${map[r.relreplident] ?? 'unknown'})`)
      )
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
