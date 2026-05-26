import { prisma } from '@/lib/prisma'
import { getTcCertificatePublicUrl } from '@/lib/storage'
import { AppStatus } from '@prisma/client'

export const metadata = { title: 'TC Certificate Registry — CSUAS Form D1 Portal' }

export const dynamic = 'force-dynamic'

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const q = searchParams.q?.trim() ?? ''

  const applications = await prisma.application.findMany({
    where: {
      status: AppStatus.TC_ISSUED,
      tcDocumentPath: { not: null },
      ...(q
        ? {
            OR: [
              { formNumber:          { contains: q, mode: 'insensitive' } },
              { modelName:           { contains: q, mode: 'insensitive' } },
              { modelVariant:        { contains: q, mode: 'insensitive' } },
              { manufacturer: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { tcIssuedDate: 'desc' },
    select: {
      id:             true,
      formNumber:     true,
      modelName:      true,
      modelVariant:   true,
      tcIssuedDate:   true,
      tcDocumentPath: true,
      manufacturer:   { select: { name: true } },
      cb:             { select: { name: true } },
    },
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">
            CSUAS Form D1 Portal
          </p>
          <h1 className="text-xl font-semibold text-slate-800">
            Type Certificate Registry
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Public registry of Type Certificates issued by DGCA under the CSUAS scheme.
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <form method="GET" className="mb-6">
          <div className="flex gap-2 max-w-md">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search by model, manufacturer, or form number…"
              className="flex-1 text-sm border border-slate-300 rounded px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
            />
            <button
              type="submit"
              className="text-sm bg-slate-800 text-white rounded px-4 py-2
                         hover:bg-slate-700 transition-colors"
            >
              Search
            </button>
            {q && (
              <a
                href="/certificates"
                className="text-sm border border-slate-300 rounded px-3 py-2
                           text-slate-600 hover:border-slate-400 transition-colors"
              >
                Clear
              </a>
            )}
          </div>
        </form>

        {applications.length === 0 ? (
          <p className="text-sm text-slate-400">
            {q ? 'No certificates match your search.' : 'No certificates on record.'}
          </p>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500
                                uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Form No.</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Manufacturer</th>
                  <th className="px-4 py-3">CB</th>
                  <th className="px-4 py-3">TC Date</th>
                  <th className="px-4 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map(app => (
                  <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {app.formNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium">
                      {app.modelName}
                      {app.modelVariant && (
                        <span className="ml-1.5 text-slate-400 font-normal text-xs">
                          {app.modelVariant}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{app.manufacturer.name}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{app.cb.name}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {app.tcIssuedDate
                        ? new Date(app.tcIssuedDate).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={getTcCertificatePublicUrl(app.tcDocumentPath!)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                      >
                        View Certificate
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-8 text-xs text-slate-400">
          {applications.length} certificate{applications.length !== 1 ? 's' : ''} found.
          This registry is updated automatically when a Type Certificate is uploaded.
        </p>
      </main>
    </div>
  )
}
