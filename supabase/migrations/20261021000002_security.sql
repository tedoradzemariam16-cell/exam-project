-- =====================================================================
-- Row Level Security. Principles:
--   * Every exposed table has RLS enabled.
--   * Teachers see and change only their own data.
--   * Students (anonymous auth users) have NO direct table access except
--     reading their own session row / participant row (needed for
--     Realtime change notifications). Everything else goes through the
--     SECURITY DEFINER functions in the game migration, which validate
--     every request with the database clock.
--   * The `anon` role (not signed in at all) gets nothing.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper predicates. SECURITY DEFINER so policies can use them without
-- recursive RLS evaluation between game_sessions and participants.
-- ---------------------------------------------------------------------
create function public.is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create function public.owns_quiz(p_quiz_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.quizzes where id = p_quiz_id and teacher_id = auth.uid());
$$;

create function public.owns_question(p_question_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.questions q
    join public.quizzes z on z.id = q.quiz_id
    where q.id = p_question_id and z.teacher_id = auth.uid()
  );
$$;

create function public.is_session_teacher(p_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.game_sessions where id = p_session_id and teacher_id = auth.uid());
$$;

create function public.is_session_participant(p_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.participants where session_id = p_session_id and user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.quizzes             enable row level security;
alter table public.learning_objectives enable row level security;
alter table public.questions           enable row level security;
alter table public.answer_options      enable row level security;
alter table public.game_sessions       enable row level security;
alter table public.session_questions   enable row level security;
alter table public.participants        enable row level security;
alter table public.answers             enable row level security;
alter table public.join_attempts       enable row level security;
alter table public.ai_generation_log   enable row level security;

-- ---------------------------------------------------------------------
-- Privileges: start from nothing, grant only what the policies need.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.quizzes to authenticated;
grant select, insert, update, delete on public.learning_objectives to authenticated;
grant select, insert, update, delete on public.questions to authenticated;
grant select, insert, update, delete on public.answer_options to authenticated;
grant select, delete on public.game_sessions to authenticated;
grant select on public.session_questions to authenticated;
grant select, delete on public.participants to authenticated;
grant select on public.answers to authenticated;
grant select, insert on public.ai_generation_log to authenticated;
-- join_attempts: no client access at all.

-- Column-level protection: a teacher may not move a quiz to another owner.
revoke update on public.quizzes from authenticated;
grant update (title, subject, grade_level, topic, learning_objective, research_question,
              source_material, source_files, question_count, difficulty, time_per_question,
              speed_bonus, base_points, max_speed_bonus, status)
  on public.quizzes to authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name, school) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- quizzes and their content: owner only
-- ---------------------------------------------------------------------
create policy quizzes_select_own on public.quizzes
  for select to authenticated using (teacher_id = auth.uid());
create policy quizzes_insert_own on public.quizzes
  for insert to authenticated with check (teacher_id = auth.uid() and public.is_teacher());
create policy quizzes_update_own on public.quizzes
  for update to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy quizzes_delete_own on public.quizzes
  for delete to authenticated using (teacher_id = auth.uid());

create policy objectives_all_own on public.learning_objectives
  for all to authenticated using (public.owns_quiz(quiz_id)) with check (public.owns_quiz(quiz_id));

create policy questions_all_own on public.questions
  for all to authenticated using (public.owns_quiz(quiz_id)) with check (public.owns_quiz(quiz_id));

create policy options_all_own on public.answer_options
  for all to authenticated using (public.owns_question(question_id)) with check (public.owns_question(question_id));

-- ---------------------------------------------------------------------
-- game sessions
--   teacher: read + delete own sessions (create/control only via functions)
--   student: read the row of the session they joined (for Realtime)
-- ---------------------------------------------------------------------
create policy sessions_select_teacher on public.game_sessions
  for select to authenticated using (teacher_id = auth.uid());
create policy sessions_select_participant on public.game_sessions
  for select to authenticated using (public.is_session_participant(id));
create policy sessions_delete_teacher on public.game_sessions
  for delete to authenticated using (teacher_id = auth.uid());

-- Correct answers live here, so teachers only.
create policy session_questions_select_teacher on public.session_questions
  for select to authenticated using (public.is_session_teacher(session_id));

create policy participants_select_teacher on public.participants
  for select to authenticated using (public.is_session_teacher(session_id));
create policy participants_select_self on public.participants
  for select to authenticated using (user_id = auth.uid());
create policy participants_delete_teacher on public.participants
  for delete to authenticated using (public.is_session_teacher(session_id));

create policy answers_select_teacher on public.answers
  for select to authenticated using (public.is_session_teacher(session_id));

-- ---------------------------------------------------------------------
-- AI usage log (used for per-teacher rate limiting by the Edge Function)
-- ---------------------------------------------------------------------
create policy ai_log_select_own on public.ai_generation_log
  for select to authenticated using (teacher_id = auth.uid());
create policy ai_log_insert_own on public.ai_generation_log
  for insert to authenticated with check (teacher_id = auth.uid() and public.is_teacher());

-- Helper predicates are needed by policies evaluated as `authenticated`.
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.owns_quiz(uuid) to authenticated;
grant execute on function public.owns_question(uuid) to authenticated;
grant execute on function public.is_session_teacher(uuid) to authenticated;
grant execute on function public.is_session_participant(uuid) to authenticated;

-- Functions created later must not be callable by default. (The global
-- PUBLIC default can only be removed without IN SCHEMA; later migrations also
-- revoke explicitly before granting.)
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
