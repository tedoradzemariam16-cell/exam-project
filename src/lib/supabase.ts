import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const rawUrl = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim()
const anonKey = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim()

/** Normalise the project URL: add a missing https:// and drop paths like /rest/v1. */
export function normalizeSupabaseUrl(value: string): string | null {
  const v = value.trim().replace(/^['"]|['"]$/g, '')
  if (!v) return null
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') && u.hostname !== 'localhost') return null
    return u.origin
  } catch {
    return null
  }
}

/** Describes what is wrong with the public configuration, or null when it is fine. */
export function describeConfigProblem(urlValue: string, keyValue: string): string | null {
  if (!urlValue) return 'VITE_SUPABASE_URL არ არის მითითებული.'
  if (!normalizeSupabaseUrl(urlValue)) {
    return 'VITE_SUPABASE_URL არასწორი ფორმატისაა. უნდა გამოიყურებოდეს ასე: https://xxxx.supabase.co'
  }
  if (!keyValue) return 'VITE_SUPABASE_ANON_KEY არ არის მითითებული.'
  if (/^https?:\/\//i.test(keyValue)) {
    return 'VITE_SUPABASE_ANON_KEY-ში მისამართია ჩაწერილი. აქ უნდა იყოს anon public (eyJ…) ან publishable (sb_publishable_…) გასაღები.'
  }
  if (/^sb_secret_/.test(keyValue)) {
    return 'VITE_SUPABASE_ANON_KEY-ში საიდუმლო (secret) გასაღებია! ის დაუყოვნებლივ წაშალეთ Vercel-იდან და ჩაწერეთ anon public / publishable გასაღები.'
  }
  return null
}

const url = normalizeSupabaseUrl(rawUrl)

/** Problem with the public settings (shown on screen), or null. */
export const configProblem = describeConfigProblem(rawUrl, anonKey)

/** True when the public Supabase settings are present and well-formed. */
export const isSupabaseConfigured = configProblem === null

function make(storageKey: string, storage: Storage | undefined): SupabaseClient {
  return createClient(url ?? 'http://localhost:54321', anonKey || 'missing-key', {
    auth: { storageKey, storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: storageKey === TEACHER_KEY },
    realtime: { params: { eventsPerSecond: 10 } },
  })
}

const TEACHER_KEY = 'taoba-teacher-auth'
const STUDENT_KEY = 'taoba-student-auth'
const TEST_MODE_FLAG = 'taoba-test-mode'

/** Client used by teacher pages (e-mail/password account). */
export const supabase: SupabaseClient = make(TEACHER_KEY, typeof window !== 'undefined' ? window.localStorage : undefined)

let studentClient: SupabaseClient | null = null

/**
 * Client used by student pages. It keeps a *separate* (anonymous) session so
 * a teacher can open the student view in the same browser without being
 * logged out. In "test mode" (/join?test=1) the session lives in
 * sessionStorage, so every browser tab acts as a different student.
 */
export function getStudentClient(): SupabaseClient {
  if (!studentClient) {
    let storage: Storage | undefined
    try {
      storage = window.sessionStorage.getItem(TEST_MODE_FLAG) === '1' ? window.sessionStorage : window.localStorage
    } catch {
      storage = undefined
    }
    studentClient = make(STUDENT_KEY, storage)
  }
  return studentClient
}

export function enableStudentTestMode(): void {
  try {
    window.sessionStorage.setItem(TEST_MODE_FLAG, '1')
  } catch {
    /* storage unavailable — ignore */
  }
  studentClient = null
}

export function isStudentTestMode(): boolean {
  try {
    return window.sessionStorage.getItem(TEST_MODE_FLAG) === '1'
  } catch {
    return false
  }
}

/** Ensure the student has an anonymous auth session (creates one if needed). */
export async function ensureStudentSession(): Promise<SupabaseClient> {
  const client = getStudentClient()
  const { data } = await client.auth.getSession()
  if (!data.session) {
    const { error } = await client.auth.signInAnonymously()
    if (error) throw error
  }
  return client
}
