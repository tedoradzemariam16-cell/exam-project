// Extract plain text from teacher materials *in the browser*. Files are never
// uploaded anywhere; only the extracted text is kept (and later trimmed before
// being sent to the AI).

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_PDF_PAGES = 80
export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const
export const ACCEPT_ATTR =
  '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown'

export type ExtractErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'LEGACY_DOC'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_FILE'
  | 'NO_TEXT_FOUND'
  | 'PDF_PASSWORD'
  | 'READ_FAILED'

export class ExtractError extends Error {
  readonly code: ExtractErrorCode
  constructor(code: ExtractErrorCode) {
    super(code)
    this.code = code
    this.name = 'ExtractError'
  }
}

export const EXTRACT_MESSAGES: Record<ExtractErrorCode, string> = {
  UNSUPPORTED_TYPE: 'ეს ფაილის ტიპი არ არის მხარდაჭერილი. ატვირთეთ PDF, DOCX ან TXT ფაილი.',
  LEGACY_DOC: 'ძველი .doc ფორმატი არ არის მხარდაჭერილი. Word-ში შეინახეთ ფაილი .docx ფორმატით ან ჩასვით ტექსტი ხელით.',
  FILE_TOO_LARGE: 'ფაილი ძალიან დიდია (მაქსიმუმ 10 მბ).',
  EMPTY_FILE: 'ფაილი ცარიელია.',
  NO_TEXT_FOUND:
    'ფაილში ტექსტი ვერ მოიძებნა. შესაძლოა ეს დასკანერებული PDF-ია (სურათი). დააკოპირეთ ტექსტი ხელით ან გამოიყენეთ ტექსტური ფაილი.',
  PDF_PASSWORD: 'PDF ფაილი პაროლითაა დაცული. მოხსენით დაცვა ან ჩასვით ტექსტი ხელით.',
  READ_FAILED: 'ფაილის წაკითხვა ვერ მოხერხდა. შესაძლოა ფაილი დაზიანებულია.',
}

export interface ExtractedFile {
  name: string
  text: string
  chars: number
  /** PDF only: pages beyond MAX_PDF_PAGES were skipped. */
  pagesSkipped?: number
}

export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

/** Validate type and size before reading anything. */
export function validateFile(file: Pick<File, 'name' | 'size'>): ExtractErrorCode | null {
  const ext = fileExtension(file.name)
  if (ext === '.doc') return 'LEGACY_DOC'
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) return 'UNSUPPORTED_TYPE'
  if (file.size === 0) return 'EMPTY_FILE'
  if (file.size > MAX_FILE_BYTES) return 'FILE_TOO_LARGE'
  return null
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function readPdf(file: File): Promise<{ text: string; pagesSkipped: number }> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    if (e && typeof e === 'object' && (e as { name?: string }).name === 'PasswordException') {
      throw new ExtractError('PDF_PASSWORD')
    }
    throw new ExtractError('READ_FAILED')
  }
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES)
  const parts: string[] = []
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items) {
      if ('str' in item) {
        line += item.str
        line += item.hasEOL ? '\n' : ' '
      }
    }
    parts.push(line)
  }
  await task.destroy()
  return { text: parts.join('\n\n'), pagesSkipped: Math.max(0, doc.numPages - pages) }
}

async function readDocx(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return result.value
  } catch {
    throw new ExtractError('READ_FAILED')
  }
}

export async function extractText(file: File): Promise<ExtractedFile> {
  const problem = validateFile(file)
  if (problem) throw new ExtractError(problem)
  const ext = fileExtension(file.name)
  let raw: string
  let pagesSkipped: number | undefined
  try {
    if (ext === '.pdf') {
      const r = await readPdf(file)
      raw = r.text
      pagesSkipped = r.pagesSkipped
    } else if (ext === '.docx') {
      raw = await readDocx(file)
    } else {
      raw = await file.text()
    }
  } catch (e) {
    if (e instanceof ExtractError) throw e
    throw new ExtractError('READ_FAILED')
  }
  const text = normalizeText(raw)
  // Fewer than ~20 letters means nothing useful was extracted (e.g. scanned PDF).
  if ((text.match(/\p{L}/gu) ?? []).length < 20) throw new ExtractError('NO_TEXT_FOUND')
  return { name: file.name, text, chars: text.length, pagesSkipped }
}

// Extracted files are stored inside the material text between markers so a
// teacher can remove a file's text again.
export const startMarker = (name: string) => `=== ფაილი: ${name} ===`
export const END_MARKER = '=== ფაილის დასასრული ==='

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function removeFileBlock(material: string, name: string): string {
  const re = new RegExp(`\\n*${escapeRegExp(startMarker(name))}\\n[\\s\\S]*?\\n${escapeRegExp(END_MARKER)}\\n*`, 'g')
  return material.replace(re, '\n\n').trim()
}
