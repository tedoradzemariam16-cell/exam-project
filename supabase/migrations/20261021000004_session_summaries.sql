-- Per-session aggregates for the teacher dashboard. Runs with the caller's
-- rights (RLS applies), so a teacher only ever sees their own sessions.
create function public.session_summaries(p_limit integer default 100)
returns table (
  session_id uuid,
  participant_count integer,
  answer_count integer,
  correct_count integer,
  avg_score numeric,
  max_score integer
)
language sql stable security invoker set search_path = '' as $$
  select s.id,
         (select count(*) from public.participants p where p.session_id = s.id)::integer,
         (select count(*) from public.answers a where a.session_id = s.id)::integer,
         (select count(*) from public.answers a where a.session_id = s.id and a.is_correct)::integer,
         (select avg(p.total_score) from public.participants p where p.session_id = s.id),
         (select max(p.total_score) from public.participants p where p.session_id = s.id)
  from public.game_sessions s
  where s.teacher_id = auth.uid()
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke execute on function public.session_summaries(integer) from public, anon;
grant execute on function public.session_summaries(integer) to authenticated;
