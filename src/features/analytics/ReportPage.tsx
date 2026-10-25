import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Download, FileText, FileType, Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { Select } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Feedback'
import { PageLoader } from '@/components/ui/Spinner'
import { LogoMark } from '@/components/Logo'
import { useAuth } from '@/features/auth/AuthProvider'
import { toGeorgianMessage } from '@/lib/errors'
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { loadSessionBundle } from '@/features/game/api'
import { computeAnalytics } from './compute'
import { buildRecommendations } from './recommendations'
import { buildObjectiveGroups, buildStudentReports, describeObjectiveGroup } from './students'
import { StudentReportView } from './StudentAnalysis'
import { downloadReportDocx, downloadReportPdf, reportFilename, type ReportInput } from './exportReport'

const MASTERY_LABEL = { strong: 'ათვისებულია', developing: 'ნაწილობრივ', weak: 'საჭიროებს გამეორებას', insufficient: 'მონაცემები არასაკმარისია' } as const

/**
 * Printable / downloadable report: class summary followed by one page per student.
 * Print uses the browser dialog; PDF and Word files are generated in the browser.
 */
export function ReportPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const scope = params.get('student') ?? 'all'
  const { profile } = useAuth()
  const { data, error, loading } = useAsync(() => loadSessionBundle(id), [id])
  const toast = useToast()
  const mainRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [menuOpen])

  const analytics = useMemo(() => (data ? computeAnalytics(data.questions, data.participants, data.answers) : null), [data])
  const reports = useMemo(() => (analytics ? buildStudentReports(analytics) : []), [analytics])
  const groups = useMemo(() => buildObjectiveGroups(reports), [reports])
  const recs = useMemo(() => (analytics ? buildRecommendations(analytics) : []), [analytics])

  if (loading && !data) return <PageLoader />
  if (error || !data || !analytics) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Alert tone="error" title="ანგარიშის ჩატვირთვა ვერ მოხერხდა">{toGeorgianMessage(error)}</Alert>
      </div>
    )
  }

  const { session } = data
  const o = analytics.overview
  const classSize = reports.filter((r) => r.answered > 0).length
  const showClass = scope === 'all' || scope === 'class'
  const students = scope === 'all' ? reports : scope === 'class' ? [] : reports.filter((r) => r.id === scope)

  async function download(format: 'pdf' | 'docx') {
    setMenuOpen(false)
    setExporting(format)
    const input: ReportInput = {
      session,
      teacherName: profile?.full_name ?? undefined,
      school: profile?.school ?? undefined,
      analytics: analytics!,
      groups,
      recommendations: recs,
      students,
      allStudents: reports,
      includeClass: showClass,
    }
    try {
      if (format === 'docx') await downloadReportDocx(input)
      else {
        const sections = Array.from(mainRef.current?.querySelectorAll<HTMLElement>('[data-report-section]') ?? [])
        await downloadReportPdf(sections, reportFilename(input, 'pdf'))
      }
      toast.success(format === 'pdf' ? 'PDF ფაილი ჩამოიტვირთა.' : 'Word ფაილი ჩამოიტვირთა.')
    } catch (e) {
      console.error(e)
      toast.error('ფაილის შექმნა ვერ მოხერხდა. სცადეთ თავიდან ან გამოიყენეთ „ბეჭდვა“.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Toolbar (not printed) */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to={`/app/analytics/${session.id}`} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <ArrowLeft className="size-4" aria-hidden /> შედეგებზე დაბრუნება
          </Link>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label htmlFor="report-scope" className="text-sm font-semibold text-slate-700">
              რა შევიდეს:
            </label>
            <Select
              id="report-scope"
              className="h-10 w-64"
              value={scope}
              onChange={(e) => setParams(e.target.value === 'all' ? {} : { student: e.target.value }, { replace: true })}
            >
              <option value="all">კლასი + ყველა მოსწავლე</option>
              <option value="class">მხოლოდ კლასის შეჯამება</option>
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  მოსწავლე: {r.name}
                </option>
              ))}
            </Select>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              ბეჭდვა / PDF-ად შენახვა
            </Button>
            <div ref={menuRef} className="relative">
              <Button
                icon={<Download className="size-4" />}
                loading={exporting !== null}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                {exporting ? 'იქმნება…' : 'ჩამოტვირთვა'}
                <ChevronDown className="size-4" aria-hidden />
              </Button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => download('pdf')}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                  >
                    <FileText className="size-5 text-red-600" aria-hidden />
                    <span>
                      <span className="block font-semibold text-slate-900">PDF ფაილი</span>
                      <span className="block text-xs text-slate-500">ზუსტად ისე, როგორც ეკრანზეა</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => download('docx')}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                  >
                    <FileType className="size-5 text-blue-700" aria-hidden />
                    <span>
                      <span className="block font-semibold text-slate-900">Word ფაილი (.docx)</span>
                      <span className="block text-xs text-slate-500">შეგიძლიათ შეცვალოთ ტექსტი</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="mx-auto max-w-4xl px-4 pb-3 text-xs text-slate-500">
          „ჩამოტვირთვა“ ქმნის PDF ან Word ფაილს არჩეული შიგთავსით. ბეჭდვის ფანჯრიდანაც შეგიძლიათ PDF-ის შენახვა — აირჩიეთ <strong>Save as PDF</strong>.
        </p>
      </div>

      <main ref={mainRef} className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8 print:max-w-none print:space-y-0 print:p-0">
        {showClass && (
          <section data-report-section className="rounded-2xl bg-white p-6 shadow-card sm:p-10 print:rounded-none print:p-0 print:shadow-none">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <p className="text-sm font-semibold text-brand-700">შედეგების ანგარიში</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-950">{session.title}</h1>
                <p className="mt-1 text-sm text-slate-600">
                  {[session.subject, session.grade_level && `${session.grade_level} კლასი`, formatDateTime(session.started_at ?? session.created_at)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {profile?.full_name && (
                  <p className="text-sm text-slate-600">
                    მასწავლებელი: {profile.full_name}
                    {profile.school && ` · ${profile.school}`}
                  </p>
                )}
              </div>
              <LogoMark className="size-11 shrink-0" />
            </header>

            <h2 className="mt-6 text-lg font-bold text-slate-900">კლასის შეჯამება</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['მონაწილეები', formatNumber(o.participantCount)],
                ['სწორი პასუხები', formatPercent(o.correctRate)],
                ['საშუალო ქულა', o.averageScore === null ? '—' : formatNumber(o.averageScore)],
                ['დაასრულა ყველა კითხვა', formatPercent(o.completionRate)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-slate-200 p-3">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="text-xl font-bold text-slate-900 tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>

            {analytics.objectives.length > 0 && (
              <>
                <h3 className="mt-6 text-base font-bold text-slate-900">შუალედური მიზნები</h3>
                <table className="mt-2 w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th scope="col" className="py-2 pr-3">მიზანი</th>
                      <th scope="col" className="py-2 pr-3 text-right">სწორი</th>
                      <th scope="col" className="py-2">შეფასება</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analytics.objectives.map((g) => (
                      <tr key={g.name}>
                        <td className="py-2 pr-3 text-slate-800">{g.name}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
                          {formatPercent(g.correctRate)} ({g.correct}/{g.responses})
                        </td>
                        <td className="py-2 whitespace-nowrap">{MASTERY_LABEL[g.mastery]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {groups.length > 0 && (
              <>
                <h3 className="mt-6 text-base font-bold text-slate-900">ვის რა სჭირდება</h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                  {groups.map((g) => (
                    <li key={g.objective}>{describeObjectiveGroup(g, classSize)}</li>
                  ))}
                </ul>
              </>
            )}

            <h3 className="mt-6 text-base font-bold text-slate-900">რეკომენდაციები</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
              {recs.map((r, i) => (
                <li key={i}>
                  <strong>{r.title}.</strong> {r.detail}
                </li>
              ))}
            </ul>

            <h3 className="mt-6 text-base font-bold text-slate-900">მოსწავლეები</h3>
            <table className="mt-2 w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th scope="col" className="py-2 pr-3">#</th>
                  <th scope="col" className="py-2 pr-3">მოსწავლე</th>
                  <th scope="col" className="py-2 pr-3 text-right">ქულა</th>
                  <th scope="col" className="py-2 pr-3 text-right">სწორი</th>
                  <th scope="col" className="py-2">სამუშაო მიზნები</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="py-2 pr-3 tabular-nums">{r.rank}</td>
                    <td className="py-2 pr-3 font-medium whitespace-nowrap">{r.name}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatNumber(r.score)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.correct}/{r.total}
                    </td>
                    <td className="py-2 text-slate-700">
                      {r.answered === 0 ? 'პასუხები არ არის' : r.focus.length ? r.focus.map((f) => f.name).join('; ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {students.map((r, i) => (
          <section
            key={r.id}
            data-report-section
            className={`rounded-2xl bg-white p-6 shadow-card sm:p-10 print:rounded-none print:p-0 print:shadow-none ${showClass || i > 0 ? 'print:break-before-page' : ''}`}
          >
            <p className="mb-4 border-b border-slate-200 pb-3 text-sm text-slate-500">
              {session.title} · {formatDateTime(session.started_at ?? session.created_at)} · მოსწავლის ანალიზი
            </p>
            <StudentReportView report={r} compact />
          </section>
        ))}

        <p className="pb-6 text-center text-xs text-slate-400 print:pt-6">
          შექმნილია „თაობა ქვიზში“ · ანალიზი ეფუძნება მხოლოდ ამ თამაშის პასუხებს
        </p>
      </main>
    </div>
  )
}
