-- Quiz language: defaults to Georgian, teachers can change it, copies keep it.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values ('77777777-0000-0000-0000-000000000007', 'lang@school.ge');
update public.profiles set status = 'approved' where id = '77777777-0000-0000-0000-000000000007';
select set_config('request.jwt.claims', '{"sub":"77777777-0000-0000-0000-000000000007"}', false);
set role authenticated;
insert into public.quizzes (title, time_per_question) values ('English quiz', 20);
select tests.ok((select language from public.quizzes where title = 'English quiz') = 'ka', 'language defaults to Georgian');
update public.quizzes set language = 'en' where title = 'English quiz';
select tests.ok((select language from public.quizzes where title = 'English quiz') = 'en', 'teacher can set the quiz language');
select tests.throws($$update public.quizzes set language = 'fr' where title = 'English quiz'$$, 'check constraint',
                    'only ka / en / ru are allowed');
select public.duplicate_quiz((select id from public.quizzes where title = 'English quiz'));
select tests.ok((select language from public.quizzes where title = 'English quiz (ასლი)') = 'en', 'a copy keeps the language');
reset role;
