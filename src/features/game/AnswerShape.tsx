import { ANSWER_STYLES } from './answerStyles'

export function AnswerBadge({ index, className = 'size-9' }: { index: number; className?: string }) {
  const s = ANSWER_STYLES[index]
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg ${s.bg} ${s.text} ${className}`}
      aria-hidden="true"
    >
      <s.Icon className="size-1/2" fill="currentColor" />
    </span>
  )
}
