-- Teacher approval and administrator (read-only oversight).
\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
  ('eeeeeeee-0000-0000-0000-000000000005', 'admin@school.ge', '{"full_name":"ადმინისტრატორი"}'),
  ('e1eeeeee-0000-0000-0000-000000000005', 'ok@school.ge', '{"full_name":"დადასტურებული"}'),
  ('e2eeeeee-0000-0000-0000-000000000005', 'new@school.ge', '{"full_name":"ახალი მასწავლებელი"}'),
  ('e3eeeeee-0000-0000-0000-000000000005', 'stranger@mail.ge', '{"full_name":"უცნობი"}');

select tests.ok((select status from public.profiles where id = 'e2eeeeee-0000-0000-0000-000000000005') = 'pending',
                'a newly registered teacher starts as pending');
-- The first administrator is set once in the SQL editor.
update public.profiles set status = 'approved', is_admin = true where id = 'eeeeeeee-0000-0000-0000-000000000005';
update public.profiles set status = 'approved' where id = 'e1eeeeee-0000-0000-0000-000000000005';

-- An approved teacher works as before and owns a quiz.
select set_config('request.jwt.claims', '{"sub":"e1eeeeee-0000-0000-0000-000000000005"}', false);
set role authenticated;
insert into public.quizzes (title, time_per_question) values ('დადასტურებულის ქვიზი', 20);
insert into tests.ctx select 'okq', id::text from public.quizzes where title = 'დადასტურებულის ქვიზი';
select tests.throws($$select public.admin_list_teachers()$$, 'NOT_ADMIN', 'a teacher cannot list teachers');
select tests.throws($$select public.admin_set_teacher_status('e2eeeeee-0000-0000-0000-000000000005', 'approved')$$,
                    'NOT_ADMIN', 'a teacher cannot approve anyone');
reset role;

-- A pending teacher can do nothing yet, and cannot approve themselves.
select set_config('request.jwt.claims', '{"sub":"e2eeeeee-0000-0000-0000-000000000005"}', false);
set role authenticated;
select tests.ok(not public.is_teacher(), 'pending teacher is not an active teacher');
select tests.ok((select status from public.profiles where id = auth.uid()) = 'pending', 'pending teacher can see their own status');
select tests.throws($$insert into public.quizzes (title) values ('ნაადრევი ქვიზი')$$, 'NOT_APPROVED', 'pending teacher cannot create a quiz');
select tests.throws($$insert into public.ai_generation_log (teacher_id, kind) values (auth.uid(), 'full')$$,
                    'row-level security', 'pending teacher cannot use AI generation');
select tests.throws($$update public.profiles set status = 'approved' where id = auth.uid()$$, 'permission denied',
                    'pending teacher cannot approve themselves');
select tests.throws($$update public.profiles set is_admin = true where id = auth.uid()$$, 'permission denied',
                    'nobody can make themselves an admin');
select tests.ok((select count(*) from public.quizzes) = 0, 'pending teacher sees no other quizzes');
reset role;

-- The administrator reviews requests and reads everything, read-only.
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000005"}', false);
set role authenticated;
select tests.ok((select status from public.admin_list_teachers() limit 1) = 'pending', 'pending requests are listed first');
select tests.ok((select email from public.admin_list_teachers() where id = 'e2eeeeee-0000-0000-0000-000000000005') = 'new@school.ge',
                'admin sees the e-mail of each request');
select tests.ok((select quiz_count from public.admin_list_teachers() where id = 'e1eeeeee-0000-0000-0000-000000000005') = 1,
                'admin sees how many quizzes a teacher has');
select tests.ok((select count(*) from public.quizzes where title = 'დადასტურებულის ქვიზი') = 1, 'admin can read other teachers'' quizzes');
update public.quizzes set title = 'შეცვლილი' where id = (select v::uuid from tests.ctx where k = 'okq');
delete from public.quizzes where id = (select v::uuid from tests.ctx where k = 'okq');
select public.admin_set_teacher_status('e2eeeeee-0000-0000-0000-000000000005', 'approved');
select public.admin_set_teacher_status('e3eeeeee-0000-0000-0000-000000000005', 'rejected');
select tests.throws($$select public.admin_set_teacher_status(auth.uid(), 'rejected')$$, 'CANNOT_CHANGE_SELF',
                    'admin cannot lock themselves out');
select tests.throws($$select public.admin_set_teacher_status('e2eeeeee-0000-0000-0000-000000000005', 'pending')$$, 'INVALID_REQUEST',
                    'only approve / reject are allowed');
select tests.throws($$select public.admin_delete_teacher('e1eeeeee-0000-0000-0000-000000000005')$$, 'TEACHER_NOT_FOUND',
                    'an approved teacher cannot be deleted with one click');
select public.admin_delete_teacher('e3eeeeee-0000-0000-0000-000000000005');
reset role;
select tests.ok((select title from public.quizzes where id = (select v::uuid from tests.ctx where k = 'okq')) = 'დადასტურებულის ქვიზი',
                'admin cannot change or delete another teacher''s quiz');
select tests.ok(not exists (select 1 from auth.users where id = 'e3eeeeee-0000-0000-0000-000000000005'),
                'admin can remove a rejected registration');
select tests.ok((select reviewed_by from public.profiles where id = 'e2eeeeee-0000-0000-0000-000000000005') = 'eeeeeeee-0000-0000-0000-000000000005',
                'the review is recorded');

-- After approval the new teacher can work; after rejection a teacher is blocked.
select set_config('request.jwt.claims', '{"sub":"e2eeeeee-0000-0000-0000-000000000005"}', false);
set role authenticated;
insert into public.quizzes (title, time_per_question) values ('ახლა უკვე შეიძლება', 20);
select tests.ok((select count(*) from public.quizzes) = 1, 'approved teacher can create quizzes');
select tests.ok((select count(*) from public.quizzes where title = 'დადასტურებულის ქვიზი') = 0, 'a teacher still sees only their own quizzes');
reset role;

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000005"}', false);
set role authenticated;
select public.admin_set_teacher_status('e1eeeeee-0000-0000-0000-000000000005', 'rejected');
reset role;
select set_config('request.jwt.claims', '{"sub":"e1eeeeee-0000-0000-0000-000000000005"}', false);
set role authenticated;
select tests.throws($$update public.quizzes set title = 'x'$$, 'NOT_APPROVED', 'a rejected teacher cannot edit quizzes');
select tests.throws($$select public.create_game_session((select v::uuid from tests.ctx where k = 'okq'))$$, 'NOT_TEACHER',
                    'a rejected teacher cannot start a game');
reset role;

-- A pending user can still delete their own account.
insert into auth.users (id, email) values ('e4eeeeee-0000-0000-0000-000000000005', 'leave@school.ge');
select set_config('request.jwt.claims', '{"sub":"e4eeeeee-0000-0000-0000-000000000005"}', false);
set role authenticated;
select public.delete_my_account();
reset role;
select tests.ok(not exists (select 1 from auth.users where id = 'e4eeeeee-0000-0000-0000-000000000005'),
                'a pending user can delete their own account');
