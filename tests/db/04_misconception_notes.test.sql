-- Misconception notes: saved, copied, snapshotted, and never shown to students.
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values ('dddddddd-0000-0000-0000-000000000004', 'd@school.ge');
insert into auth.users (id, is_anonymous) values ('5ddddddd-0000-0000-0000-000000000004', true);

select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000004"}', false);
set role authenticated;
insert into public.quizzes (title, time_per_question) values ('შეცდომების ახსნები', 20);
insert into tests.ctx select 'mq', id::text from public.quizzes where title = 'შეცდომების ახსნები';
select public.save_quiz_content((select v::uuid from tests.ctx where k = 'mq'), '["მიზანი"]',
  '[{"text":"რა გამოიყოფა ფოტოსინთეზისას?","objective_index":0,
     "options":[{"text":"ჟანგბადი","is_correct":true,"misconception":"ეს არ უნდა შეინახოს"},
                {"text":"ნახშირორჟანგი","misconception":"ერევა, რა შედის და რა გამოდის"},
                {"text":"აზოტი"},
                {"text":"წყალბადი","misconception":"ფიქრობს, რომ წყალი მთლიანად გამოიყოფა"}]}]');
select tests.ok((select misconception from public.answer_options where text = 'ნახშირორჟანგი') = 'ერევა, რა შედის და რა გამოდის',
                'misconception note is saved for a wrong option');
select tests.ok((select misconception from public.answer_options where text = 'ჟანგბადი') = '', 'correct option never keeps a note');
select tests.ok((select misconception from public.answer_options where text = 'აზოტი') = '', 'missing note defaults to empty');
select public.duplicate_quiz((select v::uuid from tests.ctx where k = 'mq'));
select tests.ok((select count(*) from public.answer_options where text = 'ნახშირორჟანგი' and misconception <> '') = 2,
                'duplicate copies misconception notes');
update public.quizzes set status = 'published' where id = (select v::uuid from tests.ctx where k = 'mq');
insert into tests.ctx select 'ms', public.create_game_session((select v::uuid from tests.ctx where k = 'mq')) ->> 'id';
insert into tests.ctx select 'mcode', code from public.game_sessions where id = (select v::uuid from tests.ctx where k = 'ms');
select tests.ok((select option_notes ->> 1 from public.session_questions where session_id = (select v::uuid from tests.ctx where k = 'ms'))
                = 'ერევა, რა შედის და რა გამოდის', 'session snapshot includes the notes (teacher can read them)');
reset role;

select set_config('request.jwt.claims', '{"sub":"5ddddddd-0000-0000-0000-000000000004","is_anonymous":true}', false);
set role authenticated;
select public.join_game((select v from tests.ctx where k = 'mcode'), 'ტესტ', 'მოსწავლე');
reset role;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000004"}', false);
set role authenticated;
select public.start_game((select v::uuid from tests.ctx where k = 'ms'));
reset role;
-- Even after the deadline (full reveal), the student never receives the notes.
update public.game_sessions set question_ends_at = now() - interval '1 second'
 where id = (select v::uuid from tests.ctx where k = 'ms');
select set_config('request.jwt.claims', '{"sub":"5ddddddd-0000-0000-0000-000000000004","is_anonymous":true}', false);
set role authenticated;
select tests.ok(public.get_player_state((select v::uuid from tests.ctx where k = 'ms'))::text not like '%ერევა%',
                'student state never contains misconception notes');
select tests.ok((select count(*) from public.session_questions) = 0, 'student still cannot read session questions');
reset role;
