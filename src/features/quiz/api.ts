import { currentUserId, supabase } from '@/lib/supabase'
import type { LearningObjective, Question, Quiz, QuizStatus } from '@/types/db'
import type { DraftQuestion, QuizSettings } from './model'

export interface QuizListItem extends Pick<
  Quiz,
  'id' | 'title' | 'subject' | 'grade_level' | 'topic' | 'status' | 'updated_at' | 'created_at' | 'difficulty'
> {
  questions: { count: number }[]
}

export async function listQuizzes(teacherId?: string): Promise<QuizListItem[]> {
  // Always filter by owner: an administrator can read every teacher's rows.
  const owner = teacherId ?? (await currentUserId())
  const { data, error } = await supabase
    .from('quizzes')
    .select('id, title, subject, grade_level, topic, status, updated_at, created_at, difficulty, questions(count)')
    .eq('teacher_id', owner)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as QuizListItem[]
}

export interface LoadedQuiz {
  quiz: Quiz
  objectives: LearningObjective[]
  questions: Question[]
}

export async function loadQuiz(id: string): Promise<LoadedQuiz> {
  const [quizRes, objRes, qRes] = await Promise.all([
    supabase.from('quizzes').select('*').eq('id', id).maybeSingle(),
    supabase.from('learning_objectives').select('*').eq('quiz_id', id).order('position'),
    supabase.from('questions').select('*, answer_options(*)').eq('quiz_id', id).order('position'),
  ])
  if (quizRes.error) throw quizRes.error
  if (!quizRes.data) throw new Error('QUIZ_NOT_FOUND')
  if (objRes.error) throw objRes.error
  if (qRes.error) throw qRes.error
  const questions = ((qRes.data ?? []) as Question[]).map((q) => ({
    ...q,
    answer_options: [...q.answer_options].sort((a, b) => a.position - b.position),
  }))
  return { quiz: quizRes.data as Quiz, objectives: (objRes.data ?? []) as LearningObjective[], questions }
}

function settingsToRow(s: QuizSettings) {
  return {
    title: s.title.trim(),
    subject: s.subject.trim(),
    grade_level: s.gradeLevel.trim(),
    topic: s.topic.trim(),
    learning_objective: s.learningObjective.trim(),
    research_question: s.researchQuestion.trim(),
    source_material: s.material,
    source_files: s.sourceFiles,
    question_count: s.questionCount,
    difficulty: s.difficulty,
    time_per_question: s.timePerQuestion,
    speed_bonus: s.speedBonus,
    base_points: s.basePoints,
    max_speed_bonus: s.maxSpeedBonus,
  }
}

/** Create or update the quiz row and then replace its objectives + questions atomically. */
export async function saveQuiz(
  id: string | null,
  settings: QuizSettings,
  objectives: string[],
  questions: DraftQuestion[],
  onCreated?: (id: string) => void,
): Promise<string> {
  let quizId = id
  if (!quizId) {
    const { data, error } = await supabase.from('quizzes').insert(settingsToRow(settings)).select('id').single()
    if (error) throw error
    quizId = data.id as string
    onCreated?.(quizId)
  } else {
    const { error } = await supabase.from('quizzes').update(settingsToRow(settings)).eq('id', quizId)
    if (error) throw error
  }
  const { error } = await supabase.rpc('save_quiz_content', {
    p_quiz_id: quizId,
    p_objectives: objectives,
    p_questions: questions.map((q) => ({
      text: q.text,
      explanation: q.explanation,
      topic: q.topic,
      objective_index: q.objectiveIndex,
      time_limit_seconds: q.timeLimitSeconds,
      source: q.source,
      options: q.options.map((text, i) => ({
        text,
        is_correct: i === q.correctIndex,
        misconception: i === q.correctIndex ? '' : q.optionNotes[i].trim(),
      })),
    })),
  })
  if (error) throw error
  return quizId
}

export async function setQuizStatus(id: string, status: QuizStatus): Promise<void> {
  const { error } = await supabase.from('quizzes').update({ status }).eq('id', id)
  if (error) throw error
}

export async function duplicateQuiz(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('duplicate_quiz', { p_quiz_id: id })
  if (error) throw error
  return data as string
}

export async function deleteQuiz(id: string): Promise<void> {
  const { error } = await supabase.from('quizzes').delete().eq('id', id)
  if (error) throw error
}
