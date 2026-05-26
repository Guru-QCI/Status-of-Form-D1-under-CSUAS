import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // ── CBs ────────────────────────────────────────────────────────────────────

  const cb1 = await prisma.cB.upsert({
    where:  { name: 'Bureau Veritas Certification India Pvt. Ltd.' },
    update: {},
    create: {
      name:                'Bureau Veritas Certification India Pvt. Ltd.',
      isNabcbAccredited:   true,
      nabcbExpiryDate:     new Date(Date.now() + 2 * 365.25 * 24 * 60 * 60 * 1000),
      contactPersonName:   'Rajesh Kumar',
      contactDesignation:  'Head of Certification',
      contactEmail:        'rajesh.kumar@example.com',
      contactPhone:        '+91-9876543210',
      address:             'Mumbai, Maharashtra',
    },
  })
  console.log('Upserted CB #1:', cb1.name)

  const cb2 = await prisma.cB.upsert({
    where:  { name: 'Indian Register Quality Systems' },
    update: {},
    create: {
      name:               'Indian Register Quality Systems',
      isNabcbAccredited:  false,
      contactPersonName:  'Priya Sharma',
      contactDesignation: 'Lead Auditor',
      contactEmail:       'priya.sharma@example.com',
      contactPhone:       '+91-9876543211',
      address:            'Bengaluru, Karnataka',
    },
  })
  console.log('Upserted CB #2:', cb2.name)

  // ── AppUsers ───────────────────────────────────────────────────────────────

  const admin = await prisma.appUser.upsert({
    where:  { email: 'guruvayurappan@qcin.org' },
    update: {},
    create: {
      id:           '00000000-0000-0000-0000-000000000001',
      email:        'guruvayurappan@qcin.org',
      fullName:     'Guruvayurappan',
      role:         'ADMIN',
      designation:  'Quality Officer',
      organisation: 'Quality Council of India',
    },
  })
  console.log('Upserted Admin:', admin.email)

  const cbUser = await prisma.appUser.upsert({
    where:  { email: 'cb.user@bureauveritas.example.com' },
    update: {},
    create: {
      id:           '00000000-0000-0000-0000-000000000002',
      email:        'cb.user@bureauveritas.example.com',
      fullName:     'Sample CB User',
      role:         'CB_USER',
      cbId:         cb1.id,
      designation:  'Application Reviewer',
      organisation: 'Bureau Veritas',
    },
  })
  console.log('Upserted CB User:', cbUser.email, '→ CB:', cb1.name)

  const publicUser = await prisma.appUser.upsert({
    where:  { email: 'public.viewer@example.com' },
    update: {},
    create: {
      id:       '00000000-0000-0000-0000-000000000003',
      email:    'public.viewer@example.com',
      fullName: 'Public Viewer',
      role:     'PUBLIC',
    },
  })
  console.log('Upserted Public User:', publicUser.email)

  // ── Manufacturer ───────────────────────────────────────────────────────────

  const mfr = await prisma.manufacturer.upsert({
    where:  { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id:           '00000000-0000-0000-0000-000000000010',
      name:         'DroneTech India Pvt. Ltd.',
      contactEmail: 'ceo@dronetech.example.com',
      contactPhone: '+91-9988776655',
    },
  })
  console.log('Upserted Manufacturer:', mfr.name)

  // ── EmailWhitelist ─────────────────────────────────────────────────────────
  // Must come after CB upserts so cb1.id is available for the CB_USER row.

  const wl1 = await prisma.emailWhitelist.upsert({
    where:  { email: 'guruvayurappan@qcin.org' },
    update: {},
    create: { email: 'guruvayurappan@qcin.org', role: 'ADMIN' },
  })
  console.log('Upserted Whitelist:', wl1.email, '→', wl1.role)

  const wl2 = await prisma.emailWhitelist.upsert({
    where:  { email: 'cb.user@bureauveritas.example.com' },
    update: {},
    create: { email: 'cb.user@bureauveritas.example.com', role: 'CB_USER', cbId: cb1.id },
  })
  console.log('Upserted Whitelist:', wl2.email, '→', wl2.role)

  const wl3 = await prisma.emailWhitelist.upsert({
    where:  { email: 'public.viewer@example.com' },
    update: {},
    create: { email: 'public.viewer@example.com', role: 'PUBLIC' },
  })
  console.log('Upserted Whitelist:', wl3.email, '→', wl3.role)

  // ── CB #3 (test-only) ──────────────────────────────────────────────────────

  const cb3 = await prisma.cB.upsert({
    where:  { name: 'Test CB Beta' },
    update: {},
    create: {
      name:               'Test CB Beta',
      isNabcbAccredited:  false,
      contactPersonName:  'Beta Test Contact',
      contactDesignation: 'Test Lead',
      contactEmail:       'beta.contact@example.com',
      contactPhone:       '+91-9000000000',
      address:            'Test Location',
    },
  })
  console.log('Upserted CB #3:', cb3.name)

  await prisma.appUser.upsert({
    where:  { email: 'test.cb.beta@example.com' },
    update: {},
    create: {
      id:           '00000000-0000-0000-0000-000000000004',
      email:        'test.cb.beta@example.com',
      fullName:     'Test Beta User',
      role:         'CB_USER',
      cbId:         cb3.id,
      designation:  'Test Reviewer',
      organisation: 'Test CB Beta',
    },
  })
  console.log('Upserted Test CB User: test.cb.beta@example.com → CB:', cb3.name)

  const wl4 = await prisma.emailWhitelist.upsert({
    where:  { email: 'test.cb.beta@example.com' },
    update: {},
    create: { email: 'test.cb.beta@example.com', role: 'CB_USER', cbId: cb3.id },
  })
  console.log('Upserted Whitelist:', wl4.email, '→', wl4.role)

  console.log('\nSeed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
