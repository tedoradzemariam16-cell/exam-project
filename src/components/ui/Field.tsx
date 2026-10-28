import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  useLayoutEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

const control =
  'w-full rounded-xl border bg-white px-3.5 text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:outline-none focus:ring-3 focus:ring-brand-200 focus:border-brand-500 disabled:bg-slate-100 disabled:text-slate-500'

const stateClass = (invalid?: boolean) => (invalid ? 'border-red-500' : 'border-slate-300 hover:border-slate-400')

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; required?: boolean }>
}

/** Label + control + hint + error, wired up for screen readers. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required,
      })
    : children
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">
        {label}
        {required && (
          <span className="text-red-600" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs leading-relaxed text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(control, 'h-11', stateClass(invalid || rest['aria-invalid'] === true), className)}
        {...rest}
      />
    )
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 3, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(control, 'py-2.5 leading-relaxed', stateClass(invalid || rest['aria-invalid'] === true), className)}
      {...rest}
    />
  )
})

/**
 * Single-paragraph text that wraps and grows with its content instead of
 * scrolling sideways (e.g. answer options). Enter does not add a new line.
 */
export function AutoTextarea({
  className,
  invalid,
  value,
  onChange,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows'> & {
  invalid?: boolean
  value: string
  onChange: (value: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\s*\n+\s*/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.preventDefault()
      }}
      className={cn(control, 'resize-none overflow-hidden py-2 leading-snug', stateClass(invalid), className)}
      {...rest}
    />
  )
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(control, 'h-11 pr-8', stateClass(invalid || rest['aria-invalid'] === true), className)}
        {...rest}
      >
        {children}
      </select>
    )
  },
)

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-brand-700' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'inline-block size-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5.5' : 'translate-x-0.5',
          )}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </label>
    </div>
  )
}
