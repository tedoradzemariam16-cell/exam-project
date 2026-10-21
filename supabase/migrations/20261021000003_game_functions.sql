-- =====================================================================
-- Server-side business logic. All time checks use the database clock
-- (now()), never a timestamp supplied by a browser. Errors are raised
-- with a stable machine-readable code in the message (e.g. 'TOO_LATE'),
-- which the frontend translates to Georgian.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Scoring (pure function; mirrored in src/features/game/scoring.ts)
--   incorrect → 0
--   correct   → base + (speed bonus ? round(max_bonus * remaining / duration) : 0)
-- ---------------------------------------------------------------------
create function public.calculate_points(
  p_correct boolean, p_remaining_ms integer, p_duration_ms integer,
  p_speed_bonus boolean, p_base integer, p_max_bonus integer
) returns integer
language sql immutable set search_path = '' as $$
  select case
    when not p_correct then 0
    when not p_speed_bonus or p_duration_ms <= 0 then p_base
    else p_base + round(p_max_bonus * least(1.0, greatest(0.0, p_remaining_ms::numeric / p_duration_ms)))::integer
  end;
$$;

create function public.server_time() returns timestamptz
language sql stable set search_path = '' as $$ select now(); $$;

-- Raise helper for consistent error codes.
create function public.raise_app_error(p_code text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using message = p_code, errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------
-- Quiz validation shared by publishing and launching
-- ---------------------------------------------------------------------
create function public.quiz_problem(p_quiz_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.questions where quiz_id = p_quiz_id) then 'QUIZ_HAS_NO_QUESTIONS'
    when exists (
      select 1 from public.questions q
      where q.quiz_id = p_quiz_id
        and ((select count(*) from public.answer_options o where o.question_id = q.id) <> 4
          or (select count(*) from public.answer_options o where o.question_id = q.id and o.is_correct) <> 1)
    ) then 'QUIZ_HAS_INVALID_QUESTIONS'
    else null
  end;
$$;

create function public.check_quiz_publishable() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_problem text;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    v_problem := public.quiz_problem(new.id);
    if v_problem is not null then
      perform public.raise_app_error(v_problem);
    end if;
  end if;
  return new;
end;
$$;

create trigger quizzes_check_publishable before insert or update of status on public.quizzes
  for each row execute function public.check_quiz_publishable();

-- ---------------------------------------------------------------------
-- Save all objectives + questions of a quiz atomically (replace-all).
-- Runs with the caller's rights, so RLS still applies.
-- p_objectives: ["objective 1", "objective 2", ...]
-- p_questions:  [{text, explanation, topic, objective_index, time_limit_seconds,
--                 source, options: [{text, is_correct} x4]}, ...]
-- ---------------------------------------------------------------------
create function public.save_quiz_content(p_quiz_id uuid, p_objectives jsonb, p_questions jsonb)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_obj_ids uuid[] := '{}';
  v_obj     jsonb;
  v_q       jsonb;
  v_opt     jsonb;
  v_qid     uuid;
  v_id      uuid;
  v_i       integer := 0;
  v_j       integer;
  v_obj_idx integer;
  v_texts   text[];
begin
  if not public.owns_quiz(p_quiz_id) then
    perform public.raise_app_error('QUIZ_NOT_FOUND');
  end if;
  if jsonb_typeof(p_objectives) is distinct from 'array' or jsonb_typeof(p_questions) is distinct from 'array' then
    perform public.raise_app_error('INVALID_INPUT');
  end if;
  if jsonb_array_length(p_questions) > 30 then
    perform public.raise_app_error('TOO_MANY_QUESTIONS');
  end if;
  if jsonb_array_length(p_objectives) > 10 then
    perform public.raise_app_error('TOO_MANY_OBJECTIVES');
  end if;

  -- Validate everything before touching data.
  for v_q in select e.value from jsonb_array_elements(p_questions) as e(value) loop
    if coalesce(btrim(v_q ->> 'text'), '') = '' then
      perform public.raise_app_error('QUESTION_TEXT_REQUIRED');
    end if;
    if jsonb_typeof(v_q -> 'options') is distinct from 'array' or jsonb_array_length(v_q -> 'options') <> 4 then
      perform public.raise_app_error('QUESTION_NEEDS_FOUR_OPTIONS');
    end if;
    if (select count(*) from jsonb_array_elements(v_q -> 'options') o
        where coalesce((o ->> 'is_correct')::boolean, false)) <> 1 then
      perform public.raise_app_error('QUESTION_NEEDS_ONE_CORRECT');
    end if;
    select array_agg(lower(btrim(coalesce(o ->> 'text', '')))) into v_texts
      from jsonb_array_elements(v_q -> 'options') o;
    if '' = any (v_texts) then
      perform public.raise_app_error('OPTION_TEXT_REQUIRED');
    end if;
    if (select count(distinct t) from unnest(v_texts) t) <> 4 then
      perform public.raise_app_error('OPTIONS_MUST_DIFFER');
    end if;
  end loop;

  delete from public.questions where quiz_id = p_quiz_id;
  delete from public.learning_objectives where quiz_id = p_quiz_id;

  for v_obj in select e.value from jsonb_array_elements(p_objectives) with ordinality as e(value, idx) order by e.idx loop
    if coalesce(btrim(v_obj #>> '{}'), '') <> '' then
      insert into public.learning_objectives (quiz_id, position, title)
      values (p_quiz_id, v_i, btrim(v_obj #>> '{}'))
      returning id into v_id;
      v_obj_ids := v_obj_ids || v_id;
      v_i := v_i + 1;
    end if;
  end loop;

  v_i := 0;
  for v_q in select e.value from jsonb_array_elements(p_questions) with ordinality as e(value, idx) order by e.idx loop
    v_obj_idx := nullif(v_q ->> 'objective_index', '')::integer;
    insert into public.questions (quiz_id, objective_id, position, text, explanation, topic, time_limit_seconds, source)
    values (
      p_quiz_id,
      case when v_obj_idx between 0 and coalesce(array_length(v_obj_ids, 1), 0) - 1 then v_obj_ids[v_obj_idx + 1] end,
      v_i,
      btrim(v_q ->> 'text'),
      coalesce(btrim(v_q ->> 'explanation'), ''),
      coalesce(btrim(v_q ->> 'topic'), ''),
      nullif(v_q ->> 'time_limit_seconds', '')::integer,
      coalesce(nullif(v_q ->> 'source', ''), 'manual')
    )
    returning id into v_qid;

    v_j := 0;
    for v_opt in select o.value from jsonb_array_elements(v_q -> 'options') with ordinality as o(value, idx) order by o.idx loop
      insert into public.answer_options (question_id, position, text, is_correct)
      values (v_qid, v_j, btrim(v_opt ->> 'text'), coalesce((v_opt ->> 'is_correct')::boolean, false));
      v_j := v_j + 1;
    end loop;
    v_i := v_i + 1;
  end loop;

  -- A published quiz must stay valid; an empty published quiz becomes a draft.
  update public.quizzes
     set status = case when status = 'published' and v_i = 0 then 'draft' else status end
   where id = p_quiz_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Duplicate a quiz (as a new draft) with all its content.
-- ---------------------------------------------------------------------
create function public.duplicate_quiz(p_quiz_id uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_new uuid;
begin
  if not public.owns_quiz(p_quiz_id) then
    perform public.raise_app_error('QUIZ_NOT_FOUND');
  end if;

  insert into public.quizzes (teacher_id, title, subject, grade_level, topic, learning_objective,
    research_question, source_material, source_files, question_count, difficulty,
    time_per_question, speed_bonus, base_points, max_speed_bonus, status)
  select auth.uid(), left(title, 190) || ' (ასლი)', subject, grade_level, topic, learning_objective,
    research_question, source_material, source_files, question_count, difficulty,
    time_per_question, speed_bonus, base_points, max_speed_bonus, 'draft'
  from public.quizzes where id = p_quiz_id
  returning id into v_new;

  insert into public.learning_objectives (quiz_id, position, title)
  select v_new, position, title from public.learning_objectives where quiz_id = p_quiz_id;

  insert into public.questions (quiz_id, objective_id, position, text, explanation, topic, time_limit_seconds, source)
  select v_new, nlo.id, q.position, q.text, q.explanation, q.topic, q.time_limit_seconds, q.source
  from public.questions q
  left join public.learning_objectives lo on lo.id = q.objective_id
  left join public.learning_objectives nlo on nlo.quiz_id = v_new and nlo.position = lo.position
  where q.quiz_id = p_quiz_id;

  insert into public.answer_options (question_id, position, text, is_correct)
  select nq.id, o.position, o.text, o.is_correct
  from public.answer_options o
  join public.questions q on q.id = o.question_id
  join public.questions nq on nq.quiz_id = v_new and nq.position = q.position
  where q.quiz_id = p_quiz_id;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------
-- Teacher: create a session (lobby) for a published quiz.
-- ---------------------------------------------------------------------
create function public.create_game_session(p_quiz_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quiz    public.quizzes%rowtype;
  v_problem text;
  v_code    text;
  v_session uuid;
  v_tries   integer := 0;
begin
  if not public.is_teacher() then
    perform public.raise_app_error('NOT_TEACHER');
  end if;

  select * into v_quiz from public.quizzes where id = p_quiz_id and teacher_id = auth.uid();
  if not found then
    perform public.raise_app_error('QUIZ_NOT_FOUND');
  end if;
  if v_quiz.status <> 'published' then
    perform public.raise_app_error('QUIZ_NOT_PUBLISHED');
  end if;
  v_problem := public.quiz_problem(p_quiz_id);
  if v_problem is not null then
    perform public.raise_app_error(v_problem);
  end if;

  -- Housekeeping: abandoned sessions older than 12 hours are closed.
  update public.game_sessions
     set status = 'finished', ended_at = now(), paused_remaining_ms = null
   where teacher_id = auth.uid() and status <> 'finished' and created_at < now() - interval '12 hours';

  if (select count(*) from public.game_sessions where teacher_id = auth.uid() and status <> 'finished') >= 3 then
    perform public.raise_app_error('TOO_MANY_OPEN_SESSIONS');
  end if;

  loop
    v_code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
    begin
      insert into public.game_sessions (quiz_id, teacher_id, code, title, subject, grade_level, topic,
        learning_objective, question_count, speed_bonus, base_points, max_speed_bonus)
      values (p_quiz_id, auth.uid(), v_code, v_quiz.title, v_quiz.subject, v_quiz.grade_level, v_quiz.topic,
        v_quiz.learning_objective,
        (select count(*) from public.questions where quiz_id = p_quiz_id),
        v_quiz.speed_bonus, v_quiz.base_points, v_quiz.max_speed_bonus)
      returning id into v_session;
      exit;
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries > 25 then
        perform public.raise_app_error('CODE_GENERATION_FAILED');
      end if;
    end;
  end loop;

  insert into public.session_questions (session_id, position, text, explanation, topic, objective_title,
    time_limit_seconds, options, correct_index)
  select v_session,
         (row_number() over (order by q.position) - 1)::integer,
         q.text, q.explanation,
         coalesce(nullif(q.topic, ''), v_quiz.topic),
         coalesce(lo.title, nullif(v_quiz.learning_objective, ''), ''),
         coalesce(q.time_limit_seconds, v_quiz.time_per_question),
         (select jsonb_agg(o.text order by o.position) from public.answer_options o where o.question_id = q.id),
         (select o.position from public.answer_options o where o.question_id = q.id and o.is_correct)
  from public.questions q
  left join public.learning_objectives lo on lo.id = q.objective_id
  where q.quiz_id = p_quiz_id;

  return jsonb_build_object('id', v_session, 'code', v_code);
end;
$$;

-- Lock and return a session owned by the caller, or fail.
create function public.lock_own_session(p_session_id uuid) returns public.game_sessions
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.game_sessions%rowtype;
begin
  select * into v_s from public.game_sessions
   where id = p_session_id and teacher_id = auth.uid()
   for update;
  if not found then
    perform public.raise_app_error('SESSION_NOT_FOUND');
  end if;
  return v_s;
end;
$$;

create function public.start_game(p_session_id uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_s     public.game_sessions%rowtype;
  v_limit integer;
begin
  v_s := public.lock_own_session(p_session_id);
  if v_s.status <> 'lobby' then
    perform public.raise_app_error('INVALID_STATE');
  end if;
  if not exists (select 1 from public.participants where session_id = p_session_id) then
    perform public.raise_app_error('NO_PARTICIPANTS');
  end if;
  select time_limit_seconds into v_limit from public.session_questions
   where session_id = p_session_id and position = 0;

  update public.game_sessions
     set status = 'active', current_index = 0, started_at = now(),
         question_started_at = now(),
         question_ends_at = now() + make_interval(secs => v_limit),
         paused_remaining_ms = null
   where id = p_session_id;
  return now();
end;
$$;

-- Advance to the next question — ONLY after the current one has fully
-- expired on the server clock — or finish the game after the last one.
create function public.next_question(p_session_id uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_s     public.game_sessions%rowtype;
  v_limit integer;
begin
  v_s := public.lock_own_session(p_session_id);
  if v_s.status <> 'active' then
    perform public.raise_app_error('INVALID_STATE');
  end if;
  if v_s.paused_remaining_ms is not null then
    perform public.raise_app_error('GAME_PAUSED');
  end if;
  if now() < v_s.question_ends_at then
    perform public.raise_app_error('QUESTION_STILL_ACTIVE');
  end if;

  if v_s.current_index + 1 >= v_s.question_count then
    update public.game_sessions
       set status = 'finished', ended_at = now()
     where id = p_session_id;
  else
    select time_limit_seconds into v_limit from public.session_questions
     where session_id = p_session_id and position = v_s.current_index + 1;
    update public.game_sessions
       set current_index = v_s.current_index + 1,
           question_started_at = now(),
           question_ends_at = now() + make_interval(secs => v_limit)
     where id = p_session_id;
  end if;
  return now();
end;
$$;

-- Pause keeps the remaining time; resume restores exactly that much time,
-- so the question is always open for its full configured duration.
create function public.pause_game(p_session_id uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.game_sessions%rowtype;
begin
  v_s := public.lock_own_session(p_session_id);
  if v_s.status <> 'active' or v_s.paused_remaining_ms is not null or now() >= v_s.question_ends_at then
    perform public.raise_app_error('CANNOT_PAUSE');
  end if;
  update public.game_sessions
     set paused_remaining_ms = greatest(0, floor(extract(epoch from (v_s.question_ends_at - now())) * 1000))::integer
   where id = p_session_id;
  return now();
end;
$$;

create function public.resume_game(p_session_id uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.game_sessions%rowtype;
begin
  v_s := public.lock_own_session(p_session_id);
  if v_s.status <> 'active' or v_s.paused_remaining_ms is null then
    perform public.raise_app_error('CANNOT_RESUME');
  end if;
  update public.game_sessions
     set question_ends_at = now() + make_interval(secs => v_s.paused_remaining_ms / 1000.0),
         paused_remaining_ms = null
   where id = p_session_id;
  return now();
end;
$$;

create function public.end_game(p_session_id uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.game_sessions%rowtype;
begin
  v_s := public.lock_own_session(p_session_id);
  if v_s.status = 'finished' then
    perform public.raise_app_error('INVALID_STATE');
  end if;
  update public.game_sessions
     set status = 'finished', ended_at = now(), paused_remaining_ms = null,
         -- an unanswered open question is closed now
         question_ends_at = least(coalesce(question_ends_at, now()), now())
   where id = p_session_id;
  return now();
end;
$$;

-- ---------------------------------------------------------------------
-- Student: join with a code. Requires a (typically anonymous) auth user.
-- Rate limited to slow down code guessing. Reveals nothing about a
-- session except its id, and only for a correct, open code.
-- ---------------------------------------------------------------------
create function public.join_game(p_code text, p_first_name text, p_last_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_first text := btrim(regexp_replace(coalesce(p_first_name, ''), '\s+', ' ', 'g'));
  v_last  text := btrim(regexp_replace(coalesce(p_last_name, ''), '\s+', ' ', 'g'));
  v_code  text := btrim(coalesce(p_code, ''));
  v_sid   uuid;
  v_pid   uuid;
begin
  if v_uid is null then
    perform public.raise_app_error('NOT_AUTHENTICATED');
  end if;

  if (select count(*) from public.join_attempts
       where user_id = v_uid and attempted_at > now() - interval '1 minute') >= 10 then
    perform public.raise_app_error('RATE_LIMITED');
  end if;
  delete from public.join_attempts where user_id = v_uid and attempted_at < now() - interval '1 hour';
  insert into public.join_attempts (user_id) values (v_uid);

  -- From here on, problems are RETURNED (not raised) so the attempt row
  -- above is committed and failed guesses count towards the rate limit.
  if v_code !~ '^[0-9]{6}$' then
    return jsonb_build_object('error', 'INVALID_CODE');
  end if;
  if char_length(v_first) not between 1 and 50 or char_length(v_last) not between 1 and 50
     or v_first ~ '[[:cntrl:]]' or v_last ~ '[[:cntrl:]]' then
    return jsonb_build_object('error', 'INVALID_NAME');
  end if;

  select id into v_sid from public.game_sessions where code = v_code and status <> 'finished';
  if not found then
    return jsonb_build_object('error', 'SESSION_NOT_FOUND');
  end if;

  -- Re-joining (e.g. after a refresh) returns the existing participant.
  select id into v_pid from public.participants where session_id = v_sid and user_id = v_uid;
  if found then
    update public.participants set last_seen_at = now() where id = v_pid;
    return jsonb_build_object('session_id', v_sid, 'participant_id', v_pid, 'rejoined', true);
  end if;

  if (select count(*) from public.participants where session_id = v_sid) >= 300 then
    return jsonb_build_object('error', 'SESSION_FULL');
  end if;

  insert into public.participants (session_id, user_id, first_name, last_name)
  values (v_sid, v_uid, v_first, v_last)
  returning id into v_pid;

  return jsonb_build_object('session_id', v_sid, 'participant_id', v_pid, 'rejoined', false);
end;
$$;

-- ---------------------------------------------------------------------
-- Student: everything the player screen needs, filtered for the caller.
-- Correct answers and points are only included after the deadline.
-- ---------------------------------------------------------------------
create function public.get_player_state(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now      timestamptz := now();
  v_p        public.participants%rowtype;
  v_s        public.game_sessions%rowtype;
  v_q        public.session_questions%rowtype;
  v_a        public.answers%rowtype;
  v_reveal   boolean := true;
  v_question jsonb := null;
  v_answer   jsonb := null;
  v_pending  integer := 0;
  v_pending_correct integer := 0;
  v_rank     integer;
  v_count    integer;
begin
  select * into v_p from public.participants where session_id = p_session_id and user_id = auth.uid();
  if not found then
    perform public.raise_app_error('NOT_A_PARTICIPANT');
  end if;
  if v_p.last_seen_at < v_now - interval '15 seconds' then
    update public.participants set last_seen_at = v_now where id = v_p.id;
  end if;

  select * into v_s from public.game_sessions where id = p_session_id;

  if v_s.status = 'active' and v_s.current_index >= 0 then
    select * into v_q from public.session_questions
     where session_id = p_session_id and position = v_s.current_index;
    v_reveal := v_s.paused_remaining_ms is null and v_now >= v_s.question_ends_at;
    select * into v_a from public.answers where participant_id = v_p.id and session_question_id = v_q.id;

    v_question := jsonb_build_object(
      'id', v_q.id, 'position', v_q.position, 'text', v_q.text,
      'options', v_q.options, 'time_limit_seconds', v_q.time_limit_seconds, 'topic', v_q.topic
    ) || case when v_reveal
              then jsonb_build_object('correct_index', v_q.correct_index, 'explanation', v_q.explanation)
              else '{}'::jsonb end;

    if v_a.id is not null then
      v_answer := jsonb_build_object('selected_index', v_a.selected_index)
        || case when v_reveal then jsonb_build_object('is_correct', v_a.is_correct, 'points', v_a.points)
                else '{}'::jsonb end;
      if not v_reveal then
        v_pending := v_a.points;
        v_pending_correct := v_a.is_correct::integer;
      end if;
    end if;
  end if;

  -- Rank/score exclude points of the still-open question so they cannot leak correctness early.
  select count(*) + 1 into v_rank
  from (
    select p.total_score - case when v_reveal then 0 else coalesce(
             (select a.points from public.answers a where a.participant_id = p.id and a.session_question_id = v_q.id), 0) end as s
    from public.participants p
    where p.session_id = p_session_id
  ) x
  where x.s > v_p.total_score - v_pending;
  select count(*) into v_count from public.participants where session_id = p_session_id;

  return jsonb_build_object(
    'server_now', v_now,
    'session', jsonb_build_object(
      'id', v_s.id, 'status', v_s.status, 'title', v_s.title,
      'current_index', v_s.current_index, 'question_count', v_s.question_count,
      'question_started_at', v_s.question_started_at, 'question_ends_at', v_s.question_ends_at,
      'paused_remaining_ms', v_s.paused_remaining_ms, 'speed_bonus', v_s.speed_bonus,
      'base_points', v_s.base_points, 'max_speed_bonus', v_s.max_speed_bonus
    ),
    'me', jsonb_build_object(
      'participant_id', v_p.id, 'first_name', v_p.first_name, 'last_name', v_p.last_name,
      'total_score', v_p.total_score - v_pending,
      'correct_count', v_p.correct_count - v_pending_correct,
      'answered_count', v_p.answered_count,
      'rank', v_rank, 'participant_count', v_count
    ),
    'question', v_question,
    'answer', v_answer
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Student: submit an answer. Validates participant, state, current
-- question, deadline (database clock) and uniqueness; computes points.
-- ---------------------------------------------------------------------
create function public.submit_answer(p_session_id uuid, p_question_id uuid, p_selected_index integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now       timestamptz := now();
  v_pid       uuid;
  v_s         public.game_sessions%rowtype;
  v_q         public.session_questions%rowtype;
  v_duration  integer;
  v_remaining integer;
  v_correct   boolean;
  v_points    integer;
  v_aid       uuid;
begin
  select id into v_pid from public.participants where session_id = p_session_id and user_id = auth.uid();
  if not found then
    perform public.raise_app_error('NOT_A_PARTICIPANT');
  end if;

  -- Shared lock: many students may answer concurrently, but the teacher
  -- cannot advance/pause in the middle of a submission.
  select * into v_s from public.game_sessions where id = p_session_id for share;
  if v_s.status <> 'active' then
    perform public.raise_app_error('QUESTION_NOT_ACTIVE');
  end if;
  if v_s.paused_remaining_ms is not null then
    perform public.raise_app_error('GAME_PAUSED');
  end if;

  select * into v_q from public.session_questions
   where session_id = p_session_id and position = v_s.current_index;
  if v_q.id is distinct from p_question_id then
    perform public.raise_app_error('QUESTION_NOT_ACTIVE');
  end if;
  if v_now >= v_s.question_ends_at then
    perform public.raise_app_error('TOO_LATE');
  end if;
  if p_selected_index is null or p_selected_index not between 0 and 3 then
    perform public.raise_app_error('INVALID_OPTION');
  end if;

  v_duration := v_q.time_limit_seconds * 1000;
  v_remaining := least(v_duration,
    greatest(0, floor(extract(epoch from (v_s.question_ends_at - v_now)) * 1000)::integer));
  v_correct := p_selected_index = v_q.correct_index;
  v_points := public.calculate_points(v_correct, v_remaining, v_duration,
    v_s.speed_bonus, v_s.base_points, v_s.max_speed_bonus);

  insert into public.answers (session_id, session_question_id, participant_id, selected_index,
    is_correct, points, response_ms, submitted_at)
  values (p_session_id, v_q.id, v_pid, p_selected_index, v_correct, v_points, v_duration - v_remaining, v_now)
  on conflict (participant_id, session_question_id) do nothing
  returning id into v_aid;

  if v_aid is null then
    perform public.raise_app_error('ALREADY_ANSWERED');
  end if;

  update public.participants
     set total_score = total_score + v_points,
         correct_count = correct_count + v_correct::integer,
         answered_count = answered_count + 1,
         last_seen_at = v_now
   where id = v_pid;

  return jsonb_build_object('accepted', true, 'selected_index', p_selected_index, 'server_now', v_now);
end;
$$;

-- ---------------------------------------------------------------------
-- Grants: only signed-in users (teachers or anonymous students).
-- Each function performs its own authorization checks.
-- Start from nothing so no function is reachable by accident.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- Policy helpers (from the security migration).
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.owns_quiz(uuid) to authenticated;
grant execute on function public.owns_question(uuid) to authenticated;
grant execute on function public.is_session_teacher(uuid) to authenticated;
grant execute on function public.is_session_participant(uuid) to authenticated;
-- ---------------------------------------------------------------------
grant execute on function public.calculate_points(boolean, integer, integer, boolean, integer, integer) to authenticated;
grant execute on function public.server_time() to authenticated;
grant execute on function public.save_quiz_content(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.duplicate_quiz(uuid) to authenticated;
grant execute on function public.create_game_session(uuid) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.next_question(uuid) to authenticated;
grant execute on function public.pause_game(uuid) to authenticated;
grant execute on function public.resume_game(uuid) to authenticated;
grant execute on function public.end_game(uuid) to authenticated;
grant execute on function public.join_game(text, text, text) to authenticated;
grant execute on function public.get_player_state(uuid) to authenticated;
grant execute on function public.submit_answer(uuid, uuid, integer) to authenticated;
-- Internal helpers used inside invoker-rights functions/triggers.
grant execute on function public.raise_app_error(text) to authenticated;
grant execute on function public.quiz_problem(uuid) to authenticated;
grant execute on function public.touch_updated_at() to authenticated;
grant execute on function public.check_quiz_publishable() to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: clients get change notifications (RLS is applied per user).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.game_sessions, public.participants, public.answers;
  end if;
end;
$$;
