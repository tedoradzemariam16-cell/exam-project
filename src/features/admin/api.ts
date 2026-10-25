import { supabase } from '@/lib/supabase'
import type { TeacherStatus } from '@/types/db'

export interface AdminTeacher {
  id: string
  full_name: string
  school: string
  email: string
  status: TeacherStatus
  is_admin: boolean
  created_at: string
  reviewed_at: string | null
  quiz_count: number
  session_count: number
  last_session_at: string | null
}

/** Every teacher account (pending requests first). Admin only. */
export async function listTeachers(): Promise<AdminTeacher[]> {
  const { data, error } = await supabase.rpc('admin_list_teachers')
  if (error) throw error
  return ((data ?? []) as AdminTeacher[]).map((t) => ({
    ...t,
    quiz_count: Number(t.quiz_count),
    session_count: Number(t.session_count),
  }))
}

export async function setTeacherStatus(teacherId: string, status: 'approved' | 'rejected'): Promise<void> {
  const { error } = await supabase.rpc('admin_set_teacher_status', { p_teacher: teacherId, p_status: status })
  if (error) throw error
}

/** Permanently removes a registration that is not approved. */
export async function deleteTeacher(teacherId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_teacher', { p_teacher: teacherId })
  if (error) throw error
}

export const TEACHER_STATUS_LABEL: Record<TeacherStatus, string> = {
  pending: 'ელოდება დადასტურებას',
  approved: 'დადასტურებული',
  rejected: 'უარყოფილი / შეჩერებული',
}
