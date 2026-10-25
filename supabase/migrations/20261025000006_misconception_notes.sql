-- =====================================================================
-- "Why did the student get it wrong?" — each wrong answer option can carry
-- a short note describing the misconception it reveals. The note is
-- written by the AI (or the teacher), reviewed by the teacher, and copied
-- into every session snapshot so analytics can explain mistakes.
-- Notes are teacher-only: students never receive them.
-- =====================================================================

alter table public.answer_options
  add column misconception text not null default '' check (char_length(misconception) <= 300);

alter table public.session_questions
  add column option_notes jsonb not null default '["", "", "", ""]'::jsonb
    check (jsonb_typeof(option_notes) = 'array' and jsonb_array_length(option_notes) = 4);

-- Recreate the three functions that write or copy answer options.
-- (Bodies are identical to 20261021000003 except for the misconception notes.)

create or replace function public.save_quiz_content(p_quiz_id uuid, p_objectives jsonb, p_questions jsonb)
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
      insert into public.answer_options (question_id, position, text, is_correct, misconception)
      values (v_qid, v_j, btrim(v_opt ->> 'text'), coalesce((v_opt ->> 'is_correct')::boolean, false),
              case when coalesce((v_opt ->> 'is_correct')::boolean, false) then ''
                   else left(coalesce(btrim(v_opt ->> 'misconception'), ''), 300) end);
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
create or replace function public.duplicate_quiz(p_quiz_id uuid) returns uuid
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

  insert into public.answer_options (question_id, position, text, is_correct, misconception)
  select nq.id, o.position, o.text, o.is_correct, o.misconception
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
create or replace function public.create_game_session(p_quiz_id uuid) returns jsonb
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
    time_limit_seconds, options, correct_index, option_notes)
  select v_session,
         (row_number() over (order by q.position) - 1)::integer,
         q.text, q.explanation,
         coalesce(nullif(q.topic, ''), v_quiz.topic),
         coalesce(lo.title, nullif(v_quiz.learning_objective, ''), ''),
         coalesce(q.time_limit_seconds, v_quiz.time_per_question),
         (select jsonb_agg(o.text order by o.position) from public.answer_options o where o.question_id = q.id),
         (select o.position from public.answer_options o where o.question_id = q.id and o.is_correct),
         (select jsonb_agg(o.misconception order by o.position) from public.answer_options o where o.question_id = q.id)
  from public.questions q
  left join public.learning_objectives lo on lo.id = q.objective_id
  where q.quiz_id = p_quiz_id;

  return jsonb_build_object('id', v_session, 'code', v_code);
end;
$$;

