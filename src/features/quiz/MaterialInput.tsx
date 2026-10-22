import { useId, useRef, useState, type DragEvent } from 'react'
import { FileText, Trash2, UploadCloud } from 'lucide-react'
import { Textarea } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Feedback'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { formatNumber } from '@/lib/format'
import type { SourceFileMeta } from '@/types/db'
import { MAX_MATERIAL_CHARS } from '../../../supabase/functions/_shared/questionSchema.ts'
import { ACCEPT_ATTR, END_MARKER, EXTRACT_MESSAGES, ExtractError, extractText, removeFileBlock, startMarker } from './extractText'
import { MAX_MATERIAL_STORED } from './model'

interface Props {
  material: string
  files: SourceFileMeta[]
  onChange: (material: string, files: SourceFileMeta[]) => void
  error?: string
}

interface FileStatus {
  name: string
  state: 'working' | 'error'
  message?: string
}

export function MaterialInput({ material, files, onChange, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaId = useId()
  const [statuses, setStatuses] = useState<FileStatus[]>([])
  const [dragging, setDragging] = useState(false)

  const handleFiles = async (list: FileList | File[]) => {
    let currentMaterial = material
    let currentFiles = files
    for (const file of Array.from(list)) {
      setStatuses((s) => [...s.filter((x) => x.name !== file.name), { name: file.name, state: 'working' }])
      try {
        const extracted = await extractText(file)
        const block = `${startMarker(file.name)}\n${extracted.text}\n${END_MARKER}`
        const base = removeFileBlock(currentMaterial, file.name)
        const next = (base ? `${base}\n\n` : '') + block
        if (next.length > MAX_MATERIAL_STORED) {
          setStatuses((s) =>
            s.map((x) =>
              x.name === file.name
                ? {
                    ...x,
                    state: 'error',
                    message: `მასალის ჯამური ზომა აღემატება ${formatNumber(MAX_MATERIAL_STORED)} სიმბოლოს. წაშალეთ ნაწილი ან ატვირთეთ უფრო მცირე ფაილი.`,
                  }
                : x,
            ),
          )
          continue
        }
        currentMaterial = next
        currentFiles = [...currentFiles.filter((f) => f.name !== file.name), { name: file.name, chars: extracted.chars }]
        onChange(currentMaterial, currentFiles)
        setStatuses((s) => s.filter((x) => x.name !== file.name))
      } catch (e) {
        const message = e instanceof ExtractError ? EXTRACT_MESSAGES[e.code] : EXTRACT_MESSAGES.READ_FAILED
        setStatuses((s) => s.map((x) => (x.name === file.name ? { ...x, state: 'error', message } : x)))
      }
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files)
  }

  const removeFile = (name: string) => {
    onChange(
      removeFileBlock(material, name),
      files.filter((f) => f.name !== name),
    )
  }

  const tooLongForAi = material.length > MAX_MATERIAL_CHARS

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
          dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50',
        )}
      >
        <UploadCloud className="size-8 text-brand-700" aria-hidden />
        <p className="mt-2 font-semibold text-slate-800">ჩააგდეთ ფაილი აქ ან</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50"
        >
          აირჩიეთ ფაილი
        </button>
        <p className="mt-2 text-xs text-slate-500">PDF, DOCX ან TXT · მაქსიმუმ 10 მბ · ტექსტი ამოიღება თქვენს ბრაუზერში</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          className="sr-only"
          aria-label="სასწავლო მასალის ფაილის ატვირთვა"
          onChange={(e) => e.target.files && void handleFiles(e.target.files)}
        />
      </div>

      {(files.length > 0 || statuses.length > 0) && (
        <ul className="space-y-2" aria-label="დამუშავებული ფაილები">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <FileText className="size-5 shrink-0 text-brand-700" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{f.name}</span>
              <span className="text-xs text-slate-500">{formatNumber(f.chars)} სიმბ.</span>
              <button
                type="button"
                onClick={() => removeFile(f.name)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                aria-label={`${f.name} — წაშლა`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
          {statuses.map((s) =>
            s.state === 'working' ? (
              <li key={s.name} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <Spinner className="size-4 text-brand-700" />
                <span className="text-sm text-slate-700">{s.name} — მუშავდება…</span>
              </li>
            ) : (
              <li key={s.name}>
                <Alert tone="error" title={s.name}>
                  {s.message}
                </Alert>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="space-y-1.5">
        <label htmlFor={textareaId} className="block text-sm font-semibold text-slate-800">
          მასალის ტექსტი
        </label>
        <Textarea
          id={textareaId}
          rows={8}
          value={material}
          onChange={(e) => onChange(e.target.value, files)}
          placeholder="ჩასვით სახელმძღვანელოს მონაკვეთი, გაკვეთილის კონსპექტი ან სხვა სასწავლო ტექსტი…"
          aria-invalid={error ? true : undefined}
        />
        <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span>
            {formatNumber(material.length)} / {formatNumber(MAX_MATERIAL_STORED)} სიმბოლო
          </span>
          {tooLongForAi && (
            <span className="font-medium text-amber-800">
              AI-ს გადაეცემა მხოლოდ პირველი ≈{formatNumber(MAX_MATERIAL_CHARS)} სიმბოლო
            </span>
          )}
        </div>
        {error && (
          <p className="text-sm font-medium text-red-700" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
