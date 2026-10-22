-- =====================================================================
-- Taoba Quiz — core schema
-- Tables, constraints, indexes, timestamps. Security (RLS) and game
-- functions live in the following migrations.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Teacher profiles (one row per real, non-anonymous auth user)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  school      text not null default '' check (char_length(school) <= 160),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Quizzes
-- ---------------------------------------------------------------------
create table public.quizzes (
  id                 uuid primary key default gen_random_uuid(),
  teacher_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title              text not null check (char_length(btrim(title)) between 1 and 200),
  subject            text not null default '' check (char_length(subject) <= 100),
  grade_level        text not null default '' check (char_length(grade_level) <= 50),
  topic              text not null default '' check (char_length(topic) <= 200),
  learning_objective text not null default '' check (char_length(learning_objective) <= 1000),
  research_question  text not null default '' check (char_length(research_question) <= 1000),
  -- Extracted plain text of the teacher's material (never the original files).
  source_material    text not null default '' check (char_length(source_material) <= 60000),
  -- Metadata only, e.g. [{"name":"lesson.pdf","chars":1234}]
  source_files       jsonb not null default '[]'::jsonb check (jsonb_typeof(source_files) = 'array'),
  question_count     integer not null default 10 check (question_count between 1 and 30),
  difficulty         text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  time_per_question  integer not null default 20 check (time_per_question between 5 and 240),
  speed_bonus        boolean not null default true,
  base_points        integer not null default 1000 check (base_points between 0 and 10000),
  max_speed_bonus    integer not null default 500 check (max_speed_bonus between 0 and 5000),
  status             text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index quizzes_teacher_updated_idx on public.quizzes (teacher_id, updated_at desc);

-- ---------------------------------------------------------------------
-- Learning objectives of a quiz (the main objective + optional sub-objectives)
-- ---------------------------------------------------------------------
create table public.learning_objectives (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.quizzes (id) on delete cascade,
  position    integer not null check (position >= 0),
  title       text not null check (char_length(btrim(title)) between 1 and 500),
  created_at  timestamptz not null default now(),
  unique (quiz_id, position)
);
create index learning_objectives_quiz_idx on public.learning_objectives (quiz_id);

-- ---------------------------------------------------------------------
-- Questions and their four answer options
-- ---------------------------------------------------------------------
create table public.questions (
  id                  uuid primary key default gen_random_uuid(),
  quiz_id             uuid not null references public.quizzes (id) on delete cascade,
  objective_id        uuid references public.learning_objectives (id) on delete set null,
  position            integer not null check (position >= 0),
  text                text not null check (char_length(btrim(text)) between 1 and 500),
  explanation         text not null default '' check (char_length(explanation) <= 1000),
  topic               text not null default '' check (char_length(topic) <= 200),
  -- null = use the quiz's time_per_question
  time_limit_seconds  integer check (time_limit_seconds between 5 and 240),
  source              text not null default 'manual' check (source in ('ai', 'ai_edited', 'manual')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (quiz_id, position)
);
create index questions_quiz_idx on public.questions (quiz_id);
create index questions_objective_idx on public.questions (objective_id);

create table public.answer_options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions (id) on delete cascade,
  position     smallint not null check (position between 0 and 3),
  text         text not null check (char_length(btrim(text)) between 1 and 300),
  is_correct   boolean not null default false,
  unique (question_id, position)            -- at most four options
);
create index answer_options_question_idx on public.answer_options (question_id);
-- At most one correct option per question (exactly-one is enforced on save/publish).
create unique index answer_options_one_correct_idx on public.answer_options (question_id) where is_correct;

-- ---------------------------------------------------------------------
-- Live game sessions
-- ---------------------------------------------------------------------
create table public.game_sessions (
  id                   uuid primary key default gen_random_uuid(),
  quiz_id              uuid references public.quizzes (id) on delete set null,
  teacher_id           uuid not null references public.profiles (id) on delete cascade,
  code                 text not null check (code ~ '^[0-9]{6}$'),
  -- 'lobby' → 'active' → 'finished'. While 'active', the phase of the current
  -- question is derived from the authoritative timestamps below:
  --   now() <  question_ends_at  → question open
  --   now() >= question_ends_at  → time is up, results revealed
  status               text not null default 'lobby' check (status in ('lobby', 'active', 'finished')),
  current_index        integer not null default -1,
  question_started_at  timestamptz,
  question_ends_at     timestamptz,
  -- Not null while paused: milliseconds that were left when the teacher paused.
  paused_remaining_ms  integer check (paused_remaining_ms >= 0),
  -- Snapshot of quiz context and scoring rules at launch time.
  title                text not null,
  subject              text not null default '',
  grade_level          text not null default '',
  topic                text not null default '',
  learning_objective   text not null default '',
  question_count       integer not null check (question_count >= 1),
  speed_bonus          boolean not null,
  base_points          integer not null,
  max_speed_bonus      integer not null,
  created_at           timestamptz not null default now(),
  started_at           timestamptz,
  ended_at             timestamptz
);
-- A code is unique among sessions that are not finished.
create unique index game_sessions_open_code_idx on public.game_sessions (code) where status <> 'finished';
create index game_sessions_teacher_idx on public.game_sessions (teacher_id, created_at desc);
create index game_sessions_quiz_idx on public.game_sessions (quiz_id);

-- Frozen copy of the questions used in a session, so later quiz edits never
-- change historical results.
create table public.session_questions (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.game_sessions (id) on delete cascade,
  position            integer not null check (position >= 0),
  text                text not null,
  explanation         text not null default '',
  topic               text not null default '',
  objective_title     text not null default '',
  time_limit_seconds  integer not null check (time_limit_seconds between 5 and 240),
  options             jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_index       smallint not null check (correct_index between 0 and 3),
  unique (session_id, position)
);

-- ---------------------------------------------------------------------
-- Participants (students). user_id is the Supabase *anonymous* auth user.
-- Only first and last name are stored — nothing else.
-- ---------------------------------------------------------------------
create table public.participants (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.game_sessions (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  first_name      text not null check (char_length(first_name) between 1 and 50),
  last_name       text not null check (char_length(last_name) between 1 and 50),
  total_score     integer not null default 0,
  correct_count   integer not null default 0,
  answered_count  integer not null default 0,
  joined_at       timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  unique (session_id, user_id)
);
create index participants_session_idx on public.participants (session_id, total_score desc);
create index participants_user_idx on public.participants (user_id);

create table public.answers (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.game_sessions (id) on delete cascade,
  session_question_id  uuid not null references public.session_questions (id) on delete cascade,
  participant_id       uuid not null references public.participants (id) on delete cascade,
  selected_index       smallint not null check (selected_index between 0 and 3),
  is_correct           boolean not null,
  points               integer not null check (points >= 0),
  response_ms          integer not null check (response_ms >= 0),
  submitted_at         timestamptz not null default now(),
  unique (participant_id, session_question_id)   -- one answer per question
);
create index answers_session_idx on public.answers (session_id);
create index answers_question_idx on public.answers (session_question_id);

-- ---------------------------------------------------------------------
-- Abuse protection logs
-- ---------------------------------------------------------------------
create table public.join_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null,
  attempted_at  timestamptz not null default now()
);
create index join_attempts_user_time_idx on public.join_attempts (user_id, attempted_at desc);

create table public.ai_generation_log (
  id          bigint generated always as identity primary key,
  teacher_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('full', 'single')),
  created_at  timestamptz not null default now()
);
create index ai_generation_log_teacher_time_idx on public.ai_generation_log (teacher_id, created_at desc);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger quizzes_touch before update on public.quizzes
  for each row execute function public.touch_updated_at();
create trigger questions_touch before update on public.questions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Create a profile for every new *non-anonymous* user (teachers).
-- Anonymous users (students) never get a profile, so they can never act
-- as teachers.
-- ---------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- An anonymous user who later upgrades to a real e-mail account gets a profile too.
create function public.handle_user_upgraded() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(old.is_anonymous, false) and not coalesce(new.is_anonymous, false) then
    insert into public.profiles (id, full_name)
    values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120))
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_upgraded after update of is_anonymous on auth.users
  for each row execute function public.handle_user_upgraded();
