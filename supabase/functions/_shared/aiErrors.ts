// Maps errors from the Gemini SDK / network into stable codes the UI understands.

export type AiErrorCode =
  | 'RATE_LIMITED' // too many requests per minute — retry shortly
  | 'QUOTA_EXHAUSTED' // daily free quota used up
  | 'MODEL_UNAVAILABLE' // model not found / overloaded
  | 'INVALID_API_KEY'
  | 'NOT_CONFIGURED'
  | 'SAFETY_BLOCKED'
  | 'INVALID_OUTPUT'
  | 'NETWORK'
  | 'UNKNOWN'

export interface ClassifiedAiError {
  code: AiErrorCode
  /** HTTP status the Edge Function should return. */
  httpStatus: number
  /** Whether trying a fallback model may help. */
  tryFallback: boolean
}

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const e = err as { status?: unknown; code?: unknown }
    if (typeof e.status === 'number') return e.status
    if (typeof e.code === 'number') return e.code
  }
  return undefined
}

export function classifyAiError(err: unknown): ClassifiedAiError {
  const status = statusOf(err)
  const message = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase()

  if (err instanceof Error && err.name === 'InvalidAiOutputError') {
    return { code: 'INVALID_OUTPUT', httpStatus: 502, tryFallback: true }
  }
  if (status === 429 || message.includes('resource_exhausted') || message.includes('quota')) {
    const daily = /per ?day|perday|daily|requests per day/.test(message)
    return { code: daily ? 'QUOTA_EXHAUSTED' : 'RATE_LIMITED', httpStatus: 429, tryFallback: true }
  }
  if (status === 401 || status === 403 || message.includes('api key not valid') || message.includes('api_key_invalid')) {
    return { code: 'INVALID_API_KEY', httpStatus: 500, tryFallback: false }
  }
  if (status === 404 || status === 503 || status === 500 || message.includes('overloaded') || message.includes('unavailable')) {
    return { code: 'MODEL_UNAVAILABLE', httpStatus: 503, tryFallback: true }
  }
  if (message.includes('safety') || message.includes('blocked')) {
    return { code: 'SAFETY_BLOCKED', httpStatus: 422, tryFallback: false }
  }
  if (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    (err instanceof Error && err.name === 'AbortError')
  ) {
    return { code: 'NETWORK', httpStatus: 504, tryFallback: true }
  }
  return { code: 'UNKNOWN', httpStatus: 500, tryFallback: false }
}
