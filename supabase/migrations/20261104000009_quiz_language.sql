-- Quiz language: questions can be generated in Georgian, English or Russian.
alter table public.quizzes
  add column language text not null default 'ka' check (language in ('ka', 'en', 'ru'));

-- Teachers may change it like the other quiz settings (column-level grant).
grant update (language) on public.quizzes to authenticated;

-- Copies keep the language.
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
    time_per_question, speed_bonus, base_points, max_speed_bonus, language, status)
  select auth.uid(), left(title, 190) || ' (ასლი)', subject, grade_level, topic, learning_objective,
    research_question, source_material, source_files, question_count, difficulty,
    time_per_question, speed_bonus, base_points, max_speed_bonus, language, 'draft'
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
