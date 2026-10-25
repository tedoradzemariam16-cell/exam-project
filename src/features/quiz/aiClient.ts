import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { messageForCode } from '@/lib/errors'
import {
  generatedQuestionSchema,
  type GeneratedQuestion,
  type GenerationRequest,
} from '../../../supabase/functions/_shared/questionSchema.ts'

export interface GenerationResult {
  questions: GeneratedQuestion[]
  requested: number
  rejected: number
  materialTruncated: boolean
}

export class AiError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
    this.name = 'AiError'
  }
  get georgian(): string {
    if (this.code === 'RATE_LIMITED') return messageForCode('RATE_LIMITED_AI')!
    return messageForCode(this.code) ?? 'AI გენერაცია ვერ მოხერხდა. სცადეთ თავიდან ან შექმენით კითხვები ხელით.'
  }
}

/** Calls the generate-questions Edge Function. The Gemini key never touches the browser. */
export async function generateQuestions(req: GenerationRequest): Promise<GenerationResult> {
  const { data, error } = await supabase.functions.invoke('generate-questions', { body: req })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let code = 'UNKNOWN'
      try {
        const body = (await error.context.json()) as { error?: string }
        code = body.error ?? code
      } catch {
        /* non-JSON error body */
      }
      throw new AiError(code)
    }
    if (error instanceof FunctionsFetchError) {
      // Offline → network problem; online → the function itself is unreachable
      // (not deployed, wrong name, JWT verification on, or crashed before CORS).
      throw new AiError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'NETWORK' : 'AI_UNREACHABLE')
    }
    if (error instanceof FunctionsRelayError) throw new AiError('MODEL_UNAVAILABLE')
    throw new AiError('UNKNOWN')
  }
  // Re-validate on the client too: never trust a response blindly.
  const raw = data as Partial<GenerationResult> | null
  const questions = (raw?.questions ?? []).flatMap((q) => {
    const r = generatedQuestionSchema.safeParse(q)
    return r.success ? [r.data] : []
  })
  if (questions.length === 0) throw new AiError('INVALID_OUTPUT')
  return {
    questions,
    requested: raw?.requested ?? questions.length,
    rejected: (raw?.rejected ?? 0) + ((raw?.questions?.length ?? 0) - questions.length),
    materialTruncated: Boolean(raw?.materialTruncated),
  }
}
