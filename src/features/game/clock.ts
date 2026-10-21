// Client-side view of the authoritative server timer. The browser never
// decides whether an answer is on time — the database does. These helpers
// only render a countdown that matches the server's deadline.

/**
 * Estimate (serverTime - localTime) from a server timestamp received in a
 * response. Half of the round-trip is assumed to be the one-way latency.
 */
export function estimateClockOffset(serverNowIso: string, requestStartedAt: number, responseReceivedAt: number): number {
  const server = Date.parse(serverNowIso)
  if (Number.isNaN(server)) return 0
  const midpoint = requestStartedAt + (responseReceivedAt - requestStartedAt) / 2
  return server - midpoint
}

export type QuestionPhase = 'idle' | 'open' | 'paused' | 'revealed' | 'finished'

export interface TimerSnapshot {
  status: 'lobby' | 'active' | 'finished'
  question_ends_at: string | null
  paused_remaining_ms: number | null
}

/** Milliseconds left on the current question as seen from the server clock. */
export function remainingMs(s: TimerSnapshot, localNow: number, offsetMs: number): number {
  if (s.status !== 'active') return 0
  if (s.paused_remaining_ms !== null) return s.paused_remaining_ms
  if (!s.question_ends_at) return 0
  const ends = Date.parse(s.question_ends_at)
  return Math.max(0, ends - (localNow + offsetMs))
}

export function questionPhase(s: TimerSnapshot, localNow: number, offsetMs: number): QuestionPhase {
  if (s.status === 'lobby') return 'idle'
  if (s.status === 'finished') return 'finished'
  if (s.paused_remaining_ms !== null) return 'paused'
  return remainingMs(s, localNow, offsetMs) > 0 ? 'open' : 'revealed'
}
