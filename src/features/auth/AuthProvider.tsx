import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { Profile } from '@/types/db'

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  /** True while the signed-in user's profile has not been fetched yet. */
  profileLoading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  // Whose profile `profile` is (null result included): right after sign-in the
  // session arrives a moment before the profile, and that gap is not "no profile".
  const [profileFor, setProfileFor] = useState<string | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s || s.user.is_anonymous) {
      setProfile(null)
      setProfileFor(null)
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile((data as Profile | null) ?? null)
    setProfileFor(s.user.id)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      setSession(data.session)
      await loadProfile(data.session)
      if (!cancelled) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // Defer DB calls out of the auth callback (recommended by supabase-js).
      window.setTimeout(() => void loadProfile(s), 0)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      profileLoading: !!session && !session.user.is_anonymous && profileFor !== session.user.id,
      refreshProfile: () => loadProfile(session),
      signOut: async () => {
        await supabase.auth.signOut()
        setProfile(null)
        setProfileFor(null)
      },
    }),
    [loading, session, profile, profileFor, loadProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
