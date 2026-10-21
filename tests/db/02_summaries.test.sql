-- session_summaries() only returns the caller's own sessions.
\set ON_ERROR_STOP 1
insert into public.quizzes (id, teacher_id, title) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'სტატისტიკა');
insert into public.game_sessions (id, teacher_id, code, title, question_count, speed_bonus, base_points, max_speed_bonus, status)
values ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '111111', 'სტატისტიკა', 1, true, 1000, 500, 'finished');
insert into public.participants (session_id, user_id, first_name, last_name, total_score)
values ('22222222-0000-0000-0000-000000000001', '5aaaaaaa-0000-0000-0000-000000000001', 'ა', 'ბ', 1200);

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
set role authenticated;
select tests.ok((select participant_count from public.session_summaries() where session_id = '22222222-0000-0000-0000-000000000001') = 1,
                'teacher sees summary of own session');
select tests.ok((select max_score from public.session_summaries() where session_id = '22222222-0000-0000-0000-000000000001') = 1200,
                'summary reports max score');
reset role;

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
set role authenticated;
select tests.ok((select count(*) from public.session_summaries()) = 0, 'teacher B sees no summaries of A''s sessions');
reset role;

select set_config('request.jwt.claims', '{"sub":"5aaaaaaa-0000-0000-0000-000000000001","is_anonymous":true}', false);
set role authenticated;
select tests.ok((select count(*) from public.session_summaries()) = 0, 'student sees no summaries');
reset role;
