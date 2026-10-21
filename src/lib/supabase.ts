import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when the public Supabase settings are present. */
export const isSupabaseConfigured = Boolean(url && anonKey && url.startsWith('http'))

function make(storageKey: string, storage: Storage | undefined): SupabaseClient {
  return createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-key', {
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
