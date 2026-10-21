-- Database tests: RLS isolation, quiz validation, authoritative timer,
-- late/duplicate answers and server-side scoring.
-- Run with: npm run test:db
\set ON_ERROR_STOP 1

create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'ASSERTION FAILED: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

create function tests.throws(p_sql text, p_expected text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like '%' || p_expected || '%' then
      raise notice 'ok - % (got %)', p_msg, p_expected;
      return;
    end if;
    raise exception 'ASSERTION FAILED: % — expected error "%" but got "%"', p_msg, p_expected, sqlerrm;
  end;
  raise exception 'ASSERTION FAILED: % — expected error "%" but statement succeeded', p_msg, p_expected;
end $$;
grant execute on all functions in schema tests to authenticated, anon;

-- Shared scratch table for passing ids between roles.
create table tests.ctx (k text primary key, v text);
grant all on tests.ctx to authenticated, anon;

set client_min_messages = notice;

-- ---------------------------------------------------------------------
-- Users: two teachers, three anonymous students
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@school.ge', '{"full_name":"მასწავლებელი ა"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@school.ge', '{"full_name":"მასწავლებელი ბ"}');
insert into auth.users (id, is_anonymous) values
  ('5aaaaaaa-0000-0000-0000-000000000001', true),
  ('5bbbbbbb-0000-0000-0000-000000000002', true),
  ('5ccccccc-0000-0000-0000-000000000003', true);

select tests.ok((select count(*) from public.profiles) = 2, 'profiles created only for non-anonymous users');
select tests.ok((select full_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'მასწავლებელი ა',
                'profile takes full_name from sign-up metadata');

-- ---------------------------------------------------------------------
-- Teacher A creates a quiz
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
set role authenticated;

insert into public.quizzes (title, subject, grade_level, topic, learning_objective, time_per_question)
values ('ფოტოსინთეზი', 'ბიოლოგია', 'VII', 'მცენარეები', 'ფოტოსინთეზის პროცესის ახსნა', 20);
insert into tests.ctx select 'quiz', id::text from public.quizzes where title = 'ფოტოსინთეზი';
insert into public.quizzes (title) values ('ცარიელი ქვიზი');
insert into tests.ctx select 'empty_quiz', id::text from public.quizzes where title = 'ცარიელი ქვიზი';

select tests.throws(
  $$update public.quizzes set status = 'published' where title = 'ცარიელი ქვიზი'$$,
  'QUIZ_HAS_NO_QUESTIONS', 'cannot publish a quiz without questions');

select tests.throws(format($$select public.save_quiz_content(%L, '["a"]', '[{"text":"Q","options":[{"text":"1","is_correct":true},{"text":"2"},{"text":"3"}]}]')$$,
  (select v from tests.ctx where k = 'quiz')), 'QUESTION_NEEDS_FOUR_OPTIONS', 'rejects a question with 3 options');
select tests.throws(format($$select public.save_quiz_content(%L, '["a"]', '[{"text":"Q","options":[{"text":"1","is_correct":true},{"text":"2","is_correct":true},{"text":"3"},{"text":"4"}]}]')$$,
  (select v from tests.ctx where k = 'quiz')), 'QUESTION_NEEDS_ONE_CORRECT', 'rejects two correct options');
select tests.throws(format($$select public.save_quiz_content(%L, '["a"]', '[{"text":"Q","options":[{"text":"1"},{"text":"2"},{"text":"3"},{"text":"4"}]}]')$$,
  (select v from tests.ctx where k = 'quiz')), 'QUESTION_NEEDS_ONE_CORRECT', 'rejects zero correct options');
select tests.throws(format($$select public.save_quiz_content(%L, '["a"]', '[{"text":"Q","options":[{"text":"1","is_correct":true},{"text":"1"},{"text":"3"},{"text":"4"}]}]')$$,
  (select v from tests.ctx where k = 'quiz')), 'OPTIONS_MUST_DIFFER', 'rejects duplicate options');

select public.save_quiz_content(
  (select v::uuid from tests.ctx where k = 'quiz'),
  '["ფოტოსინთეზის პროცესის ახსნა", "ქლოროფილის როლის გაგება"]'::jsonb,
  '[
    {"text":"რა გამოიყოფა ფოტოსინთეზისას?","explanation":"ჟანგბადი","topic":"პროდუქტები","objective_index":0,"time_limit_seconds":10,"source":"ai",
     "options":[{"text":"ჟანგბადი","is_correct":true},{"text":"აზოტი"},{"text":"მეთანი"},{"text":"ჰელიუმი"}]},
    {"text":"რომელი პიგმენტი შთანთქავს სინათლეს?","topic":"პიგმენტები","objective_index":1,
     "options":[{"text":"კაროტინი"},{"text":"ქლოროფილი","is_correct":true},{"text":"მელანინი"},{"text":"ჰემოგლობინი"}]}
  ]'::jsonb);

select tests.ok((select count(*) from public.questions) = 2, 'teacher saved two questions');
select tests.ok((select count(*) from public.answer_options) = 8, 'each question has four options');
select tests.ok((select count(*) from public.learning_objectives) = 2, 'two learning objectives saved');

update public.quizzes set status = 'published' where id = (select v::uuid from tests.ctx where k = 'quiz');
select tests.ok((select status from public.quizzes where id = (select v::uuid from tests.ctx where k = 'quiz')) = 'published',
                'valid quiz can be published');

select tests.ok(public.duplicate_quiz((select v::uuid from tests.ctx where k = 'quiz')) is not null, 'quiz can be duplicated');
select tests.ok((select count(*) from public.quizzes where title like '%(ასლი)' and status = 'draft') = 1, 'duplicate is a draft');
select tests.ok((select count(*) from public.questions) = 4, 'duplicate copies questions');

select tests.throws($$update public.quizzes set teacher_id = 'bbbbbbbb-0000-0000-0000-000000000002'$$,
  'permission denied', 'teacher cannot transfer quiz ownership');

reset role;

-- ---------------------------------------------------------------------
-- Teacher B cannot see or touch teacher A's data
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
set role authenticated;
select tests.ok((select count(*) from public.quizzes) = 0, 'teacher B sees none of A''s quizzes');
select tests.ok((select count(*) from public.questions) = 0, 'teacher B sees none of A''s questions');
select tests.ok((select count(*) from public.answer_options) = 0, 'teacher B sees none of A''s answer options');
update public.quizzes set title = 'hacked';
delete from public.quizzes;
select tests.throws(format('select public.save_quiz_content(%L, ''[]'', ''[]'')', (select v from tests.ctx where k = 'quiz')),
  'QUIZ_NOT_FOUND', 'teacher B cannot overwrite A''s questions');
select tests.throws(format('select public.create_game_session(%L)', (select v from tests.ctx where k = 'quiz')),
  'QUIZ_NOT_FOUND', 'teacher B cannot launch A''s quiz');
select tests.throws(format('select public.duplicate_quiz(%L)', (select v from tests.ctx where k = 'quiz')),
  'QUIZ_NOT_FOUND', 'teacher B cannot duplicate A''s quiz');
select tests.throws(format($$insert into public.questions (quiz_id, position, text) values (%L, 9, 'x')$$, (select v from tests.ctx where k = 'quiz')),
  'row-level security', 'teacher B cannot insert questions into A''s quiz');
reset role;
select tests.ok((select count(*) from public.quizzes where title = 'hacked') = 0, 'B''s update had no effect');
select tests.ok((select count(*) from public.quizzes) = 3, 'B''s delete had no effect');

-- ---------------------------------------------------------------------
-- Not signed in at all (anon role): no access
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '', false);
set role anon;
select tests.throws('select count(*) from public.quizzes', 'permission denied', 'anon cannot read quizzes');
select tests.throws($$select public.join_game('123456', 'a', 'b')$$, 'permission denied', 'anon cannot call join_game');
reset role;

-- ---------------------------------------------------------------------
-- Teacher A launches a session
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
set role authenticated;
insert into tests.ctx select 'session', (public.create_game_session((select v::uuid from tests.ctx where k = 'quiz')) ->> 'id');
insert into tests.ctx select 'code', code from public.game_sessions where id = (select v::uuid from tests.ctx where k = 'session');
select tests.ok((select v from tests.ctx where k = 'code') ~ '^[0-9]{6}$', 'session gets a 6-digit code');
select tests.ok((select count(*) from public.session_questions) = 2, 'questions are snapshotted into the session');
select tests.throws(format('select public.create_game_session(%L)', (select id from public.quizzes where status = 'draft' limit 1)),
  'QUIZ_NOT_PUBLISHED', 'draft quiz cannot be launched');
select tests.throws(format('select public.start_game(%L)', (select v from tests.ctx where k = 'session')),
  'NO_PARTICIPANTS', 'cannot start without participants');
reset role;

-- ---------------------------------------------------------------------
-- Students join
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"5aaaaaaa-0000-0000-0000-000000000001","is_anonymous":true}', false);
set role authenticated;
select tests.ok((select count(*) from public.quizzes) = 0, 'student cannot read quizzes');
select tests.throws($$insert into public.quizzes (title) values ('student quiz')$$, 'row-level security', 'student cannot create quizzes');
select tests.ok(public.join_game('000000', 'ნინო', 'ბერიძე') ->> 'error' = 'SESSION_NOT_FOUND', 'wrong code is rejected');
select tests.ok(public.join_game('12ab', 'ნინო', 'ბერიძე') ->> 'error' = 'INVALID_CODE', 'malformed code is rejected');
select tests.ok(public.join_game((select v from tests.ctx where k = 'code'), '', 'ბერიძე') ->> 'error' = 'INVALID_NAME', 'empty name is rejected');
select tests.ok((public.join_game((select v from tests.ctx where k = 'code'), '  ნინო ', 'ბერიძე') ->> 'rejoined') = 'false', 'student 1 joins');
select tests.ok((public.join_game((select v from tests.ctx where k = 'code'), 'ნინო', 'ბერიძე') ->> 'rejoined') = 'true', 'rejoining returns the same participant');
select tests.ok((select first_name from public.participants) = 'ნინო', 'names are trimmed; student sees only own participant row');
select tests.ok((public.get_player_state((select v::uuid from tests.ctx where k = 'session')) -> 'session' ->> 'status') = 'lobby', 'student sees lobby state');
select tests.ok((select count(*) from public.session_questions) = 0, 'student cannot read session questions (correct answers)');
select tests.ok((select count(*) from public.game_sessions) = 1, 'student can read own session row (for realtime)');
select tests.throws(format($$select public.submit_answer(%L, gen_random_uuid(), 0)$$, (select v from tests.ctx where k = 'session')),
  'QUESTION_NOT_ACTIVE', 'cannot answer before the game starts');
select tests.throws(format('select public.start_game(%L)', (select v from tests.ctx where k = 'session')),
  'SESSION_NOT_FOUND', 'student cannot start the game');
reset role;

select set_config('request.jwt.claims', '{"sub":"5bbbbbbb-0000-0000-0000-000000000002","is_anonymous":true}', false);
set role authenticated;
select public.join_game((select v from tests.ctx where k = 'code'), 'გიორგი', 'კაპანაძე');
select tests.ok((select count(*) from public.participants) = 1, 'student 2 cannot see other participants');
reset role;

-- Teacher B cannot see A's session or its participants
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}', false);
set role authenticated;
select tests.ok((select count(*) from public.game_sessions) = 0, 'teacher B cannot see A''s sessions');
select tests.ok((select count(*) from public.participants) = 0, 'teacher B cannot see A''s participants');
select tests.throws(format('select public.start_game(%L)', (select v from tests.ctx where k = 'session')),
  'SESSION_NOT_FOUND', 'teacher B cannot control A''s session');
reset role;

-- ---------------------------------------------------------------------
-- Game starts: question 1 (10 seconds)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
set role authenticated;
select public.start_game((select v::uuid from tests.ctx where k = 'session'));
select tests.ok((select count(*) from public.participants) = 2, 'teacher sees both participants');
reset role;
insert into tests.ctx select 'q1', id::text from public.session_questions
  where session_id = (select v::uuid from tests.ctx where k = 'session') and position = 0;
select tests.ok((select question_ends_at - question_started_at from public.game_sessions) = interval '10 seconds',
                'server sets the deadline from the question duration');

select set_config('request.jwt.claims', '{"sub":"5aaaaaaa-0000-0000-0000-000000000001","is_anonymous":true}', false);
set role authenticated;
select tests.ok((public.get_player_state((select v::uuid from tests.ctx where k = 'session')) -> 'question' ->> 'correct_index') is null,
                'correct answer is hidden while the question is open');
select tests.ok(jsonb_array_length(public.get_player_state((select v::uuid from tests.ctx where k = 'session')) -> 'question' -> 'options') = 4,
                'student receives four options');
select tests.throws(format($$select public.submit_answer(%L, %L, 7)$$, (select v from tests.ctx where k = 'session'), (select v from tests.ctx where k = 'q1')),
  'INVALID_OPTION', 'option index outside 0..3 is rejected');
select tests.ok((public.submit_answer((select v::uuid from tests.ctx where k = 'session'), (select v::uuid from tests.ctx where k = 'q1'), 0) ->> 'accepted') = 'true',
                'student 1 answer accepted');
select tests.throws(format($$select public.submit_answer(%L, %L, 1)$$, (select v from tests.ctx where k = 'session'), (select v from tests.ctx where k = 'q1')),
  'ALREADY_ANSWERED', 'duplicate submission is rejected');
select tests.ok((public.get_player_state((select v::uuid from tests.ctx where k = 'session')) -> 'me' ->> 'total_score')::int = 0,
                'score does not reveal correctness before the deadline');
select tests.throws($$update public.participants set total_score = 999999$$, 'permission denied', 'student cannot modify scores');
select tests.throws(format($$insert into public.answers (session_id, session_question_id, participant_id, selected_index, is_correct, points, response_ms) values (%L, %L, gen_random_uuid(), 0, true, 5000, 0)$$,
  (select v from tests.ctx where k = 'session'), (select v from tests.ctx where k = 'q1')), 'permission denied', 'student cannot insert answers directly');
select tests.throws(format($$update public.game_sessions set question_ends_at = now() + interval '1 hour' where id = %L$$, (select v from tests.ctx where k = 'session')),
  'permission denied', 'student cannot change the timer');
reset role;

select set_config('request.jwt.claims', '{"sub":"5bbbbbbb-0000-0000-0000-000000000002","is_anonymous":true}', false);
set role authenticated;
select public.submit_answer((select v::uuid from tests.ctx where k = 'session'), (select v::uuid from tests.ctx where k = 'q1'), 2);
reset role;

-- Everyone has answered, but the question must stay open for the full duration.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
set role authenticated;
select tests.throws(format('select public.next_question(%L)', (select v from tests.ctx where k = 'session')),
  'QUESTION_STILL_ACTIVE', 'cannot advance before the timer expires even if all students answered');
select tests.throws(format($$update public.game_sessions set question_ends_at = now() where id = %L$$, (select v from tests.ctx where k = 'session')),
  'permission denied', 'teacher cannot shorten the timer by direct update');
reset role;

-- Scoring check (server side): correct + speed bonus within bounds, wrong = 0
select tests.ok((select points from public.answers where selected_index = 0) between 1000 and 1500, 'correct answer gets 1000 + speed bonus');
select tests.ok((select points from public.answers where selected_index = 0) > 1450, 'fast answer gets nearly the full bonus');
select tests.ok((select points from public.answers where selected_index = 2) = 0, 'incorrect answer gets 0 points');

-- Simulate the deadline passing (only possible as database owner).
update public.game_sessions set question_ends_at = now() - interval '1 millisecond'
 where id = (select v::uuid from tests.ctx where k = 'session');

select set_config('request.jwt.claims', '{"sub":"5ccccccc-0000-0000-0000-000000000003","is_anonymous":true}', false);
set role authenticated;
select public.join_game((select v from tests.ctx where k = 'code'), 'ლუკა', 'მაისურაძე');
select tests.throws(format($$select public.submit_answer(%L, %L, 0)$$, (select v from tests.ctx where k = 'session'), (select v from tests.ctx where k = 'q1')),
  'TOO_LATE', 'answer after the deadline is rejected');
reset role;

select set_config('request.jwt.claims', '{"sub":"5aaaaaaa-0000-0000-0000-000000000001","is_anonymous":true}', false);
set role authenticated;
select tests.ok((public.get_player_state((select v::uuid from tests.ctx where k = 'session')) -> 'question' ->> 'correct_index')::int = 0,
                'correct answer revealed after the deadline');
select tests.ok((public.get_player_state((select v::uuid from tests.ctx where k = 'session')) -> 'answer' ->> 'is_correct')::boolean,
                'student sees own result after the deadline');
select tests.ok((public.get_player_state((select v::uuid from tests.ctx where k = 'session')) -> 'me' ->> 'rank')::int = 1, 'fastest correct student ranks first');
reset role;

-- ---------------------------------------------------------------------
-- Question 2: pause / resume keeps remaining time
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
set role authenticated;
select public.next_question((select v::uuid from tests.ctx where k = 'session'));
select tests.ok((select current_index from public.game_sessions) = 1, 'advanced to question 2 after expiry');
select tests.ok((select question_ends_at - question_started_at from public.game_sessions) = interval '20 seconds',
                'question without own limit uses quiz default (20 s)');
select public.pause_game((select v::uuid from tests.ctx where k = 'session'));
select tests.ok((select paused_remaining_ms from public.game_sessions) between 19000 and 20000, 'pause stores remaining time');
reset role;
insert into tests.ctx select 'q2', id::text from public.session_questions
  where session_id = (select v::uuid from tests.ctx where k = 'session') and position = 1;

select set_config('request.jwt.claims', '{"sub":"5aaaaaaa-0000-0000-0000-000000000001","is_anonymous":true}', false);
set role authenticated;
select tests.throws(format($$select public.submit_answer(%L, %L, 1)$$, (select v from tests.ctx where k = 'session'), (select v from tests.ctx where k = 'q2')),
  'GAME_PAUSED', 'answers are rejected while paused');
reset role;

-- Simulate a long pause: the deadline in the stored row is already in the past,
-- but resuming must restore the remaining time, not expire the question.
update public.game_sessions set question_ends_at = now() - interval '1 minute'
 where id = (select v::uuid from tests.ctx where k = 'session');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
set role authenticated;
select tests.throws(format('select public.next_question(%L)', (select v from tests.ctx where k = 'session')),
  'GAME_PAUSED', 'cannot advance while paused');
select public.resume_game((select v::uuid from tests.ctx where k = 'session'));
select tests.ok((select question_ends_at - now() from public.game_sessions) between interval '19 seconds' and interval '20 seconds',
                'resume restores the remaining time');
reset role;

select set_config('request.jwt.claims', '{"sub":"5aaaaaaa-0000-0000-0000-000000000001","is_anonymous":true}', false);
set role authenticated;
select tests.ok((public.submit_answer((select v::uuid from tests.ctx where k = 'session'), (select v::uuid from tests.ctx where k = 'q2'), 1) ->> 'accepted') = 'true',
                'answer accepted after resume');
select tests.throws(format($$select public.submit_answer(%L, %L, 1)$$, (select v from tests.ctx where k = 'session'), (select v from tests.ctx where k = 'q1')),
  'QUESTION_NOT_ACTIVE', 'answers to a previous question are rejected');
reset role;

-- Expire and finish
update public.game_sessions set question_ends_at = now() - interval '1 millisecond'
 where id = (select v::uuid from tests.ctx where k = 'session');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
set role authenticated;
select public.next_question((select v::uuid from tests.ctx where k = 'session'));
select tests.ok((select status from public.game_sessions) = 'finished', 'game finishes after the last question');
select tests.ok((select count(*) from public.answers) = 3, 'teacher sees all accepted answers');
select tests.ok((select total_score from public.participants where first_name = 'ნინო') =
                (select sum(points) from public.answers a join public.participants p on p.id = a.participant_id where p.first_name = 'ნინო'),
                'participant total equals the sum of server-computed points');
reset role;

select set_config('request.jwt.claims', '{"sub":"5aaaaaaa-0000-0000-0000-000000000001","is_anonymous":true}', false);
set role authenticated;
select tests.throws(format($$select public.submit_answer(%L, %L, 1)$$, (select v from tests.ctx where k = 'session'), (select v from tests.ctx where k = 'q2')),
  'QUESTION_NOT_ACTIVE', 'no answers after the game finished');
delete from public.game_sessions;
reset role;
select tests.ok((select count(*) from public.game_sessions) = 1, 'student cannot delete the session');

-- ---------------------------------------------------------------------
-- Scoring function
-- ---------------------------------------------------------------------
select tests.ok(public.calculate_points(false, 20000, 20000, true, 1000, 500) = 0, 'wrong answer = 0 even if instant');
select tests.ok(public.calculate_points(true, 20000, 20000, true, 1000, 500) = 1500, 'instant correct = 1500');
select tests.ok(public.calculate_points(true, 10000, 20000, true, 1000, 500) = 1250, 'half time left = 1250');
select tests.ok(public.calculate_points(true, 0, 20000, true, 1000, 500) = 1000, 'no time left = 1000');
select tests.ok(public.calculate_points(true, 15000, 20000, false, 1000, 500) = 1000, 'speed bonus disabled = base only');

-- ---------------------------------------------------------------------
-- Join rate limiting
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"5ccccccc-0000-0000-0000-000000000003","is_anonymous":true}', false);
set role authenticated;
-- Each call is its own transaction, as it would be through the API.
-- Limit: 10 attempts per minute (this student already joined once above).
select public.join_game('999999', 'a', 'b') \g
select public.join_game('999999', 'a', 'b') \g
select public.join_game('999999', 'a', 'b') \g
select public.join_game('999999', 'a', 'b') \g
select public.join_game('999999', 'a', 'b') \g
select public.join_game('999999', 'a', 'b') \g
select public.join_game('999999', 'a', 'b') \g
select public.join_game('999999', 'a', 'b') \g
select public.join_game('999999', 'a', 'b') \g
select tests.throws($$select public.join_game('999998', 'a', 'b')$$, 'RATE_LIMITED', 'join attempts are rate limited');
reset role;

-- ---------------------------------------------------------------------
-- Deleting a session removes its participant data
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
set role authenticated;
delete from public.game_sessions where id = (select v::uuid from tests.ctx where k = 'session');
reset role;
select tests.ok((select count(*) from public.participants) = 0, 'participants deleted with the session');
select tests.ok((select count(*) from public.answers) = 0, 'answers deleted with the session');

-- Deleting a quiz keeps no orphaned content
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
set role authenticated;
delete from public.quizzes where id = (select v::uuid from tests.ctx where k = 'quiz');
reset role;
select tests.ok((select count(*) from public.questions where quiz_id = (select v::uuid from tests.ctx where k = 'quiz')) = 0,
                'questions deleted with the quiz');
