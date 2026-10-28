import { useId } from 'react'
import { ArrowDown, ArrowUp, Check, Lightbulb, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { Badge, Card } from '@/components/ui/Card'
import { AutoTextarea, Input, Select, Textarea } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { AnswerBadge } from '@/features/game/AnswerShape'
import { optionLabel } from '@/features/game/answerStyles'
import { TIME_OPTIONS, answerGiveAways, type DraftQuestion, type QuestionIssues } from './model'

interface Props {
  index: number
  total: number
  question: DraftQuestion
  objectives: string[]
  defaultTime: number
  issues: QuestionIssues | null
  showIssues: boolean
  aiAvailable: boolean
  regenerating: boolean
  onChange: (q: DraftQuestion) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
  onRegenerate: () => void
}

export function QuestionCard({
  index,
  total,
  question: q,
  objectives,
  defaultTime,
  issues,
  showIssues,
  aiAvailable,
  regenerating,
  onChange,
  onMove,
  onDelete,
  onRegenerate,
}: Props) {
  const baseId = useId()
  const update = (patch: Partial<DraftQuestion>) =>
    onChange({ ...q, ...patch, source: q.source === 'ai' ? 'ai_edited' : q.source })
  const err = showIssues ? issues : null
  const giveAways = answerGiveAways(q)

  return (
    <Card className={cn('overflow-hidden', err && 'border-red-300')}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
            {index + 1}
          </span>
          {q.source === 'ai' && (
            <Badge tone="violet">
              <Sparkles className="size-3" aria-hidden /> AI — გადასახედი
            </Badge>
          )}
          {q.source === 'ai_edited' && <Badge tone="brand">AI · რედაქტირებული</Badge>}
          {!issues ? (
            <Badge tone="green">
              <Check className="size-3" aria-hidden /> მზადაა
            </Badge>
          ) : (
            showIssues && <Badge tone="red">საჭიროებს შესწორებას</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="rounded-lg p-2 text-slate-600 hover:bg-white disabled:opacity-30"
            aria-label={`კითხვა ${index + 1} — ზემოთ გადატანა`}
          >
            <ArrowUp className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="rounded-lg p-2 text-slate-600 hover:bg-white disabled:opacity-30"
            aria-label={`კითხვა ${index + 1} — ქვემოთ გადატანა`}
          >
            <ArrowDown className="size-4" />
          </button>
          {aiAvailable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              loading={regenerating}
              icon={<RefreshCw className="size-4" aria-hidden />}
            >
              <span className="hidden sm:inline">ხელახლა გენერირება</span>
              <span className="sr-only sm:hidden">კითხვა {index + 1} — ხელახლა გენერირება</span>
            </Button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
            aria-label={`კითხვა ${index + 1} — წაშლა`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <label htmlFor={`${baseId}-text`} className="block text-sm font-semibold text-slate-800">
            კითხვა
          </label>
          <Textarea
            id={`${baseId}-text`}
            rows={2}
            value={q.text}
            onChange={(e) => update({ text: e.target.value })}
            invalid={Boolean(err?.text)}
            placeholder="მაგ.: რომელი გაზი გამოიყოფა ფოტოსინთეზის დროს?"
          />
          {err?.text && <p className="text-sm font-medium text-red-700">{err.text}</p>}
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-800">
            პასუხები <span className="font-normal text-slate-500">— მონიშნეთ ერთი სწორი</span>
          </legend>
          <div className="grid gap-2">
            {q.options.map((opt, i) => {
              const correct = q.correctIndex === i
              return (
                <div
                  key={i}
                  className={cn(
                    'flex items-start gap-2 rounded-xl border p-2 transition-colors',
                    correct ? 'border-green-500 bg-green-50' : 'border-slate-200',
                    err?.optionIndexes?.includes(i) && 'border-red-400',
                  )}
                >
                  <AnswerBadge index={i} className="mt-1 size-8 shrink-0" />
                  <AutoTextarea
                    value={opt}
                    onChange={(v) => {
                      const options = [...q.options] as DraftQuestion['options']
                      options[i] = v
                      update({ options })
                    }}
                    aria-label={`პასუხი ${optionLabel(i)}`}
                    placeholder={`პასუხი ${optionLabel(i)}`}
                    className="min-h-10 flex-1 border-transparent shadow-none"
                  />
                  <label
                    className={cn(
                      'mt-1 flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold',
                      correct ? 'bg-green-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    <input
                      type="radio"
                      name={`${baseId}-correct`}
                      checked={correct}
                      onChange={() => update({ correctIndex: i })}
                      className="size-4 accent-green-600"
                    />
                    სწორი
                  </label>
                </div>
              )
            })}
          </div>
          {(err?.options || err?.correctIndex) && (
            <p className="mt-2 text-sm font-medium text-red-700">{err.options ?? err.correctIndex}</p>
          )}
          {giveAways.length > 0 && (
            <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-950">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
              <span>
                სწორი პასუხი შეიძლება გამოსაცნობი იყოს:{' '}
                {giveAways
                  .map((g) =>
                    g === 'longest'
                      ? 'ის სხვა პასუხებზე შესამჩნევად გრძელია'
                      : 'მხოლოდ ის იმეორებს კითხვაში არსებულ სიტყვას',
                  )
                  .join('; ')}
                . გაათანაბრეთ პასუხები ან სცადეთ „ხელახლა გენერირება“.
              </span>
            </p>
          )}
        </fieldset>

        <details className="group rounded-xl border border-slate-200 bg-slate-50/60" open={q.optionNotes.some((n, i) => i !== q.correctIndex && n.trim() !== '')}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-800">
            <Lightbulb className="size-4 text-amber-600" aria-hidden />
            რას ნიშნავს არასწორი პასუხის არჩევა?
            <span className="font-normal text-slate-500">— ანალიტიკისთვის, არასავალდებულო</span>
          </summary>
          <div className="space-y-2 px-3 pb-3">
            <p className="text-xs text-slate-500">
              ჩაწერეთ, რა ტიპურ შეცდომას ავლენს თითოეული არასწორი პასუხი. შედეგებში ეს დაგეხმარებათ გაიგოთ, რატომ შეცდა
              მოსწავლე. მოსწავლეები ამ ტექსტს ვერ ხედავენ.
            </p>
            {q.options.map((opt, i) =>
              i === q.correctIndex ? null : (
                <div key={i} className="flex items-start gap-2">
                  <AnswerBadge index={i} className="mt-1.5 size-7 shrink-0" />
                  <AutoTextarea
                    value={q.optionNotes[i]}
                    maxLength={300}
                    onChange={(v) => {
                      const optionNotes = [...q.optionNotes] as DraftQuestion['optionNotes']
                      optionNotes[i] = v
                      update({ optionNotes })
                    }}
                    aria-label={`შეცდომის ახსნა პასუხისთვის ${optionLabel(i)}${opt ? `: ${opt}` : ''}`}
                    placeholder={opt ? `მაგ.: „${opt}“-ის არჩევა ნიშნავს, რომ მოსწავლე…` : 'შეცდომის ახსნა'}
                    className="min-h-10 flex-1"
                  />
                </div>
              ),
            )}
          </div>
        </details>

        <div className="space-y-1.5">
          <label htmlFor={`${baseId}-expl`} className="block text-sm font-semibold text-slate-800">
            ახსნა <span className="font-normal text-slate-500">(ნაჩვენებია პასუხის შემდეგ)</span>
          </label>
          <Textarea
            id={`${baseId}-expl`}
            rows={2}
            value={q.explanation}
            onChange={(e) => update({ explanation: e.target.value })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor={`${baseId}-topic`} className="block text-sm font-semibold text-slate-800">
              ქვეთემა
            </label>
            <Input id={`${baseId}-topic`} value={q.topic} onChange={(e) => update({ topic: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${baseId}-obj`} className="block text-sm font-semibold text-slate-800">
              სასწავლო მიზანი
            </label>
            <Select
              id={`${baseId}-obj`}
              value={q.objectiveIndex ?? ''}
              onChange={(e) => update({ objectiveIndex: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="">— არ არის მითითებული —</option>
              {objectives.map((o, i) => (
                <option key={i} value={i}>
                  {o.length > 60 ? `${o.slice(0, 60)}…` : o}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${baseId}-time`} className="block text-sm font-semibold text-slate-800">
              დრო
            </label>
            <Select
              id={`${baseId}-time`}
              value={q.timeLimitSeconds ?? ''}
              onChange={(e) => update({ timeLimitSeconds: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="">ნაგულისხმევი ({defaultTime} წმ)</option>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t} წამი
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
    </Card>
  )
}
