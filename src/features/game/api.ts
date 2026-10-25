import type { SupabaseClient } from '@supabase/supabase-js'
import { currentUserId, supabase } from '@/lib/supabase'
import type { AnswerRow, GameSession, Participant, PlayerState, SessionQuestion } from '@/types/db'

// ------------------------------------------------------------------ teacher

export async function createGameSession(quizId: string): Promise<{ id: string; code: string }> {
  const { data, error } = await supabase.rpc('create_game_session', { p_quiz_id: quizId })
  if (error) throw error
  return data as { id: string; code: string }
}

type Control = 'start_game' | 'next_question' | 'pause_game' | 'resume_game' | 'end_game'

export async function controlGame(action: Control, sessionId: string): Promise<void> {
  const { error } = await supabase.rpc(action, { p_session_id: sessionId })
  if (error) throw error
}

export async function fetchServerTime(): Promise<{ serverNow: string; started: number; received: number }> {
  const started = Date.now()
  const { data, error } = await supabase.rpc('server_time')
  if (error) throw error
  return { serverNow: data as string, started, received: Date.now() }
}

export interface SessionListItem extends GameSession {
  participants: { count: number }[]
}

export async function listSessions(teacherId?: string): Promise<SessionListItem[]> {
  // Always filter by owner: an administrator can read every teacher's rows.
  const owner = teacherId ?? (await currentUserId())
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*, participants(count)')
    .eq('teacher_id', owner)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []) as SessionListItem[]
}

/** PostgREST returns at most ~1000 rows per request — page through everything. */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < pageSize) return out
  }
}

export interface SessionSummary {
  session_id: string
  participant_count: number
  answer_count: number
  correct_count: number
  avg_score: number | null
  max_score: number | null
}

export async function listSessionSummaries(limit = 100): Promise<SessionSummary[]> {
  const { data, error } = await supabase.rpc('session_summaries', { p_limit: limit })
  if (error) throw error
  return ((data ?? []) as SessionSummary[]).map((r) => ({ ...r, avg_score: r.avg_score === null ? null : Number(r.avg_score) }))
}

export interface SessionBundle {
  session: GameSession
  questions: SessionQuestion[]
  participants: Participant[]
  answers: AnswerRow[]
}

export async function loadSessionBundle(sessionId: string): Promise<SessionBundle> {
  const [s, questions, participants, answers] = await Promise.all([
    supabase.from('game_sessions').select('*').eq('id', sessionId).maybeSingle(),
    fetchAll<SessionQuestion>((from, to) =>
      supabase.from('session_questions').select('*').eq('session_id', sessionId).order('position').range(from, to),
    ),
    fetchAll<Participant>((from, to) =>
      supabase.from('participants').select('*').eq('session_id', sessionId).order('joined_at').order('id').range(from, to),
    ),
    fetchAll<AnswerRow>((from, to) =>
      supabase.from('answers').select('*').eq('session_id', sessionId).order('id').range(from, to),
    ),
  ])
  if (s.error) throw s.error
  if (!s.data) throw new Error('SESSION_NOT_FOUND')
  return { session: s.data as GameSession, questions, participants, answers }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('game_sessions').delete().eq('id', sessionId)
  if (error) throw error
}

export async function deleteFinishedSessions(): Promise<number> {
  const { data, error } = await supabase.from('game_sessions').delete().eq('teacher_id', await currentUserId()).eq('status', 'finished').select('id')
  if (error) throw error
  return data?.length ?? 0
}

export async function removeParticipant(participantId: string): Promise<void> {
  const { error } = await supabase.from('participants').delete().eq('id', participantId)
  if (error) throw error
}

// ------------------------------------------------------------------ student

export async function joinGame(
  client: SupabaseClient,
  code: string,
  firstName: string,
  lastName: string,
): Promise<{ session_id: string; participant_id: string }> {
  const { data, error } = await client.rpc('join_game', {
    p_code: code,
    p_first_name: firstName,
    p_last_name: lastName,
  })
  if (error) throw error
  const res = data as { error?: string; session_id: string; participant_id: string }
  if (res.error) throw new Error(res.error)
  return res
}

export async function getPlayerState(
  client: SupabaseClient,
  sessionId: string,
): Promise<{ state: PlayerState; started: number; received: number }> {
  const started = Date.now()
  const { data, error } = await client.rpc('get_player_state', { p_session_id: sessionId })
  if (error) throw error
  return { state: data as PlayerState, started, received: Date.now() }
}

export async function submitAnswer(
  client: SupabaseClient,
  sessionId: string,
  questionId: string,
  selectedIndex: number,
): Promise<void> {
  const { error } = await client.rpc('submit_answer', {
    p_session_id: sessionId,
    p_question_id: questionId,
    p_selected_index: selectedIndex,
  })
  if (error) throw error
}
