-- Long learning objectives (up to 5000 characters) are accepted.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values ('ffffffff-0000-0000-0000-000000000006', 'long@school.ge');
update public.profiles set status = 'approved' where id = 'ffffffff-0000-0000-0000-000000000006';
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000006"}', false);
set role authenticated;
insert into public.quizzes (title, time_per_question, learning_objective) values ('გრძელი მიზნები', 20, repeat('მ', 3000));
insert into tests.ctx select 'lq', id::text from public.quizzes where title = 'გრძელი მიზნები';
select public.save_quiz_content((select v::uuid from tests.ctx where k = 'lq'),
  jsonb_build_array(repeat('ა', 3000), repeat('ბ', 4999)),
  '[{"text":"კითხვა?","objective_index":1,"options":[{"text":"ა","is_correct":true},{"text":"ბ"},{"text":"გ"},{"text":"დ"}]}]');
select tests.ok((select max(char_length(title)) from public.learning_objectives
                  where quiz_id = (select v::uuid from tests.ctx where k = 'lq')) = 4999,
                'objectives longer than 500 characters are saved');
select tests.throws($$update public.quizzes set learning_objective = repeat('x', 5001) where title = 'გრძელი მიზნები'$$,
                    'check constraint', 'a sane upper bound still exists');
reset role;
select tests.ok((select count(*) from pg_constraint where conrelid = 'public.learning_objectives'::regclass and contype = 'c'
                  and pg_get_constraintdef(oid) like '%500)%') = 0, 'the old 500 limit is gone');
