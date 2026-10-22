import { describe, expect, it } from 'vitest'
import { describeConfigProblem, normalizeSupabaseUrl } from '@/lib/supabase'

describe('Supabase configuration checks', () => {
  it('normalises common URL mistakes instead of crashing', () => {
    expect(normalizeSupabaseUrl('abcd.supabase.co')).toBe('https://abcd.supabase.co')
    expect(normalizeSupabaseUrl(' https://abcd.supabase.co/ ')).toBe('https://abcd.supabase.co')
    expect(normalizeSupabaseUrl('https://abcd.supabase.co/rest/v1/')).toBe('https://abcd.supabase.co')
    expect(normalizeSupabaseUrl('"https://abcd.supabase.co"')).toBe('https://abcd.supabase.co')
    expect(normalizeSupabaseUrl('eyJhbGciOiJIUzI1NiJ9')).toBeNull()
    expect(normalizeSupabaseUrl('')).toBeNull()
  })

  it('explains what is wrong in Georgian', () => {
    expect(describeConfigProblem('', 'k')).toContain('VITE_SUPABASE_URL')
    expect(describeConfigProblem('not a url', 'k')).toContain('არასწორი ფორმატისაა')
    expect(describeConfigProblem('https://a.supabase.co', '')).toContain('VITE_SUPABASE_ANON_KEY')
    expect(describeConfigProblem('https://a.supabase.co', 'https://a.supabase.co')).toContain('მისამართია')
    expect(describeConfigProblem('https://a.supabase.co', 'sb_secret_abc')).toContain('საიდუმლო')
    expect(describeConfigProblem('https://a.supabase.co', 'eyJhbGciOi')).toBeNull()
    expect(describeConfigProblem('a.supabase.co', 'sb_publishable_x')).toBeNull()
  })
})
