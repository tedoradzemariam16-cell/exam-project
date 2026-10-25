// Download the analytics report as a Word (.docx) or PDF file.
// Both are generated entirely in the browser (free, nothing is uploaded).
// The libraries are loaded on demand so the rest of the site stays small.

import type { GameSession } from '@/types/db'
import { formatDateTime, formatNumber, formatPercent } from '@/lib/format'
import type { SessionAnalytics } from './compute'
import type { Recommendation } from './recommendations'
import { describeObjectiveGroup, type ObjectiveGroup, type StudentReport } from './students'

const MASTERY_LABEL = {
  strong: 'ათვისებულია',
  developing: 'ნაწილობრივ',
  weak: 'საჭიროებს გამეორებას',
  insufficient: 'მონაცემები არასაკმარისია',
} as const
const STUDENT_STATUS = { mastered: 'ათვისებულია', partial: 'ნაწილობრივ', needs_work: 'სამუშაოა' } as const

export interface ReportInput {
  session: GameSession
  teacherName?: string
  school?: string
  analytics: SessionAnalytics
  groups: ObjectiveGroup[]
  recommendations: Recommendation[]
  /** students to include (each gets its own page) */
  students: StudentReport[]
  /** all students (for the class table) */
  allStudents: StudentReport[]
  includeClass: boolean
}

export function reportFilename(input: Pick<ReportInput, 'session' | 'students' | 'includeClass'>, ext: 'pdf' | 'docx'): string {
  const base = input.session.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '_').slice(0, 50) || 'ანგარიში'
  const date = (input.session.started_at ?? input.session.created_at).slice(0, 10)
  const who =
    !input.includeClass && input.students.length === 1
      ? `_${input.students[0].name.replace(/\s+/g, '_')}`
      : input.includeClass && input.students.length === 0
        ? '_კლასი'
        : ''
  return `${base}_ანგარიში${who}_${date}.${ext}`
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ------------------------------------------------------------------ Word

export async function downloadReportDocx(input: ReportInput): Promise<void> {
  saveBlob(await buildReportDocx(input), reportFilename(input, 'docx'))
}

export async function buildReportDocx(input: ReportInput): Promise<Blob> {
  const d = await import('docx')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType } = d

  const p = (text: string, opts: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) =>
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, ...opts })] })
  const h1 = (text: string, pageBreakBefore = false) =>
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore, spacing: { after: 160 }, children: [new TextRun({ text, bold: true, size: 32, color: '21337D' })] })
  const h2 = (text: string) =>
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text, bold: true, size: 26, color: '21337D' })] })
  const bullet = (text: string, boldPrefix?: string) =>
    new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 80 },
      children: boldPrefix ? [new TextRun({ text: boldPrefix, bold: true }), new TextRun({ text: ` ${text}` })] : [new TextRun(text)],
    })
  const table = (headers: string[], rows: string[][], widths: number[]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: headers.map(
            (h, i) =>
              new TableCell({
                width: { size: widths[i], type: WidthType.PERCENTAGE },
                shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'EEF2FF' },
                children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })],
              }),
          ),
        }),
        ...rows.map(
          (r) =>
            new TableRow({
              children: r.map(
                (c, i) =>
                  new TableCell({
                    width: { size: widths[i], type: WidthType.PERCENTAGE },
                    children: [new Paragraph({ children: [new TextRun({ text: c, size: 20 })] })],
                  }),
              ),
            }),
        ),
      ],
    })

  const { session, analytics: a } = input
  const o = a.overview
  const when = formatDateTime(session.started_at ?? session.created_at)
  const meta = [session.subject, session.grade_level && `${session.grade_level} კლასი`, when].filter(Boolean).join(' · ')
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = []

  if (input.includeClass) {
    children.push(p('შედეგების ანგარიში', { color: '3448DE', bold: true }))
    children.push(h1(session.title))
    children.push(p(meta, { color: '475569' }))
    if (input.teacherName) children.push(p(`მასწავლებელი: ${input.teacherName}${input.school ? ` · ${input.school}` : ''}`, { color: '475569' }))

    children.push(h2('კლასის შეჯამება'))
    children.push(
      table(
        ['მონაწილეები', 'სწორი პასუხები', 'საშუალო ქულა', 'დაასრულა ყველა კითხვა'],
        [[formatNumber(o.participantCount), formatPercent(o.correctRate), o.averageScore === null ? '—' : formatNumber(o.averageScore), formatPercent(o.completionRate)]],
        [25, 25, 25, 25],
      ),
    )
    if (a.objectives.length) {
      children.push(h2('შუალედური მიზნები'))
      children.push(
        table(
          ['მიზანი', 'სწორი', 'შეფასება'],
          a.objectives.map((g) => [g.name, `${formatPercent(g.correctRate)} (${g.correct}/${g.responses})`, MASTERY_LABEL[g.mastery]]),
          [60, 20, 20],
        ),
      )
    }
    const classSize = input.allStudents.filter((r) => r.answered > 0).length
    if (input.groups.length) {
      children.push(h2('ვის რა სჭირდება'))
      input.groups.forEach((g) => children.push(bullet(describeObjectiveGroup(g, classSize))))
    }
    if (input.recommendations.length) {
      children.push(h2('რეკომენდაციები'))
      input.recommendations.forEach((r) => children.push(bullet(r.detail, `${r.title}.`)))
    }
    children.push(h2('მოსწავლეები'))
    children.push(
      table(
        ['#', 'მოსწავლე', 'ქულა', 'სწორი', 'სამუშაო მიზნები'],
        input.allStudents.map((r) => [
          String(r.rank),
          r.name,
          formatNumber(r.score),
          `${r.correct}/${r.total}`,
          r.answered === 0 ? 'პასუხები არ არის' : r.focus.length ? r.focus.map((f) => f.name).join('; ') : '—',
        ]),
        [6, 26, 12, 10, 46],
      ),
    )
  }

  input.students.forEach((r, i) => {
    children.push(h1(r.name, input.includeClass || i > 0))
    children.push(p(`${session.title} · ${when} · ${r.rank} ადგილი · ${formatNumber(r.score)} ქულა · სწორი ${r.correct}/${r.total}`, { color: '475569' }))
    children.push(p(r.summary))
    if (r.objectives.length) {
      children.push(h2('შუალედური მიზნები'))
      children.push(
        table(
          ['მიზანი', 'სწორი', 'შეფასება'],
          r.objectives.map((ob) => [ob.name, `${ob.correct}/${ob.total}`, `${STUDENT_STATUS[ob.status]}${ob.limited ? ' (1 კითხვა)' : ''}`]),
          [60, 15, 25],
        ),
      )
    }
    if (r.mistakes.length) {
      children.push(h2('შეცდომები'))
      r.mistakes.forEach((m) => {
        children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: `${m.position + 1}. ${m.question}`, bold: true })] }))
        children.push(p(`✗ აირჩია: ${m.chosenText}    ✓ სწორია: ${m.correctText}`))
        if (m.note) children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: 'რატომ შეცდა: ', bold: true, color: '92400E' }), new TextRun({ text: m.note, color: '92400E' })] }))
      })
    }
    if (r.recommendations.length) {
      children.push(h2('რეკომენდაციები მასწავლებლისთვის'))
      r.recommendations.forEach((x) => children.push(bullet(x)))
    }
  })

  children.push(p('შექმნილია „თაობა ქვიზში“ · ანალიზი ეფუძნება მხოლოდ ამ თამაშის პასუხებს', { color: '94A3B8', size: 18, italics: true }))

  const doc = new Document({
    creator: 'თაობა ქვიზი',
    title: `${session.title} — ანგარიში`,
    // Sylfaen ships with Windows and covers Georgian; Word substitutes elsewhere.
    styles: { default: { document: { run: { font: 'Sylfaen', size: 22 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
        children,
      },
    ],
  })
  return Packer.toBlob(doc)
}

// ------------------------------------------------------------------ PDF

/**
 * Render the on-screen report sections to an A4 PDF. Each section starts on
 * a new page; long sections are split between lines/rows, never through text.
 */
export async function downloadReportPdf(sections: HTMLElement[], filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  await document.fonts.ready
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const margin = 12
  const contentW = 210 - margin * 2
  const contentH = 297 - margin * 2
  let firstPage = true

  for (const el of sections) {
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      onclone: (_doc, clone) => {
        clone.style.boxShadow = 'none'
        clone.style.borderRadius = '0'
      },
    })
    const widthPx = el.offsetWidth
    const heightPx = el.offsetHeight
    const ratio = canvas.width / widthPx
    const pageHeightPx = (contentH / contentW) * widthPx
    // Safe places to cut: bottoms of text blocks, rows and cards.
    const top = el.getBoundingClientRect().top
    const breaks = Array.from(el.querySelectorAll<HTMLElement>('p, li, tr, h1, h2, h3, h4, dl, table, header, li > div, section > div'))
      .map((n) => n.getBoundingClientRect().bottom - top)
      .filter((b) => b > 0 && b < heightPx)
      .sort((x, y) => x - y)

    let y = 0
    while (y < heightPx - 1) {
      let end = Math.min(y + pageHeightPx, heightPx)
      if (end < heightPx) {
        const candidates = breaks.filter((b) => b > y + pageHeightPx * 0.3 && b <= end)
        if (candidates.length) end = candidates[candidates.length - 1]
      }
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = Math.max(1, Math.round((end - y) * ratio))
      const ctx = slice.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, slice.width, slice.height)
      ctx.drawImage(canvas, 0, Math.round(y * ratio), canvas.width, slice.height, 0, 0, canvas.width, slice.height)
      if (!firstPage) pdf.addPage()
      firstPage = false
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, contentW, ((end - y) / widthPx) * contentW)
      y = end
    }
  }
  pdf.save(filename)
}
