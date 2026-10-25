// Hand-written row types matching supabase/migrations. Keep in sync.

export type QuizStatus = 'draft' | 'published' | 'archived'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type QuestionSource = 'ai' | 'ai_edited' | 'manual'
export type SessionStatus = 'lobby' | 'active' | 'finished'

export interface Profile {
  id: string
  full_name: string
  school: string
  created_at: string
}

export interface Quiz {
  id: string
  teacher_id: string
  title: string
  subject: string
  grade_level: string
  topic: string
  learning_objective: string
  research_question: string
  source_material: string
  source_files: SourceFileMeta[]
  question_count: number
  difficulty: Difficulty
  time_per_question: number
  speed_bonus: boolean
  base_points: number
  max_speed_bonus: number
  status: QuizStatus
  created_at: string
  updated_at: string
}

export interface SourceFileMeta {
  name: string
  chars: number
}

export interface LearningObjective {
  id: string
  quiz_id: string
  position: number
  title: string
}

export interface Question {
  id: string
  quiz_id: string
  objective_id: string | null
  position: number
  text: string
  explanation: string
  topic: string
  time_limit_seconds: number | null
  source: QuestionSource
  answer_options: AnswerOption[]
}

export interface AnswerOption {
  id: string
  question_id: string
  position: number
  text: string
  is_correct: boolean
  /** What choosing this wrong option reveals (teacher-only). */
  misconception: string
}

export interface GameSession {
  id: string
  quiz_id: string | null
  teacher_id: string
  code: string
  status: SessionStatus
  current_index: number
  question_started_at: string | null
  question_ends_at: string | null
  paused_remaining_ms: number | null
  title: string
  subject: string
  grade_level: string
  topic: string
  learning_objective: string
  question_count: number
  speed_bonus: boolean
  base_points: number
  max_speed_bonus: number
  created_at: string
  started_at: string | null
  ended_at: string | null
}

export interface SessionQuestion {
  id: string
  session_id: string
  position: number
  text: string
  explanation: string
  topic: string
  objective_title: string
  time_limit_seconds: number
  options: string[]
  correct_index: number
  /** Per option: misconception note ('' for the correct one). Teacher-only. */
  option_notes?: string[]
}

export interface Participant {
  id: string
  session_id: string
  first_name: string
  last_name: string
  total_score: number
  correct_count: number
  answered_count: number
  joined_at: string
  last_seen_at: string
}

export interface AnswerRow {
  id: string
  session_id: string
  session_question_id: string
  participant_id: string
  selected_index: number
  is_correct: boolean
  points: number
  response_ms: number
  submitted_at: string
}

/** Shape returned by the get_player_state() database function. */
export interface PlayerState {
  server_now: string
  session: {
    id: string
    status: SessionStatus
    title: string
    current_index: number
    question_count: number
    question_started_at: string | null
    question_ends_at: string | null
    paused_remaining_ms: number | null
    speed_bonus: boolean
    base_points: number
    max_speed_bonus: number
  }
  me: {
    participant_id: string
    first_name: string
    last_name: string
    total_score: number
    correct_count: number
    answered_count: number
    rank: number
    participant_count: number
  }
  question: {
    id: string
    position: number
    text: string
    options: string[]
    time_limit_seconds: number
    topic: string
    correct_index?: number
    explanation?: string
  } | null
  answer: {
    selected_index: number
    is_correct?: boolean
    points?: number
  } | null
}
