-- A teacher can delete only their own account; everything they own goes with it.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000003', 'c@school.ge');
insert into public.quizzes (teacher_id, title) values ('cccccccc-0000-0000-0000-000000000003', 'C-ს ქვიზი');
insert into public.game_sessions (teacher_id, code, title, question_count, speed_bonus, base_points, max_speed_bonus, status)
values ('cccccccc-0000-0000-0000-000000000003', '333333', 'C', 1, true, 1000, 500, 'finished');

-- Students cannot use it.
select set_config('request.jwt.claims', '{"sub":"5bbbbbbb-0000-0000-0000-000000000002","is_anonymous":true}', false);
set role authenticated;
select tests.throws('select public.delete_my_account()', 'NOT_TEACHER', 'students cannot delete accounts');
reset role;

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000003"}', false);
set role authenticated;
select public.delete_my_account();
reset role;

select tests.ok(not exists (select 1 from auth.users where id = 'cccccccc-0000-0000-0000-000000000003'), 'auth user deleted');
select tests.ok(not exists (select 1 from public.profiles where id = 'cccccccc-0000-0000-0000-000000000003'), 'profile deleted');
select tests.ok(not exists (select 1 from public.quizzes where teacher_id = 'cccccccc-0000-0000-0000-000000000003'), 'quizzes deleted');
select tests.ok(not exists (select 1 from public.game_sessions where teacher_id = 'cccccccc-0000-0000-0000-000000000003'), 'sessions deleted');
select tests.ok(exists (select 1 from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'other teachers are untouched');
