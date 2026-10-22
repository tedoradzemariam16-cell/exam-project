# Architecture (developer notes)

## Overview

```
Browser (React SPA, Vercel)                 Supabase (Free)
├─ Teacher UI ── supabase-js (teacher session) ──► Postgres + RLS (tables, SQL functions)
├─ Student UI ── supabase-js (anonymous session) ─► SECURITY DEFINER game functions
│                 └─ Realtime postgres_changes ◄── publication: game_sessions, participants, answers
└─ Quiz editor ── functions.invoke ──────────────► Edge Function generate-questions ──► Gemini API
```

* **No custom backend server.** Business rules that must be trusted live in Postgres functions
  (`supabase/migrations/20261021000003_game_functions.sql`); the only server-side code outside the DB is
  the Gemini Edge Function.
* **Two Supabase clients** in the browser (`src/lib/supabase.ts`): teacher (e-mail/password, storage key
  `taoba-teacher-auth`) and student (anonymous, `taoba-student-auth`). A teacher can therefore open the
  student view in the same browser without being logged out. `/join?test=1` puts the student session in
  `sessionStorage` so each tab is a distinct student.

## Data model

`profiles` (teachers only, created by trigger for non-anonymous users) → `quizzes` → `learning_objectives`,
`questions` → `answer_options` (exactly 4 positions; partial unique index allows at most one `is_correct`;
"exactly one" is enforced by `save_quiz_content` and the publish trigger).

`game_sessions` (state machine `lobby → active → finished`, authoritative `question_started_at`,
`question_ends_at`, `paused_remaining_ms`) → `session_questions` (frozen snapshot incl. `correct_index`,
`objective_title`, `topic`) → `participants` (anonymous `user_id`, first/last name only) → `answers`
(`unique(participant_id, session_question_id)`, server-computed `points`, `response_ms`).

Snapshotting means editing or deleting a quiz never changes historical analytics.

## Authoritative timer

* `start_game` / `next_question` set `question_ends_at = now() + time_limit`.
* `next_question` raises `QUESTION_STILL_ACTIVE` while `now() < question_ends_at`, so a question is always
  open for its full duration even if everyone answered.
* `submit_answer` checks participant, `status = 'active'`, not paused, `p_question_id` is the current
  question, `now() < question_ends_at`, and inserts with `ON CONFLICT DO NOTHING` (→ `ALREADY_ANSWERED`).
  Points = `calculate_points(correct, remaining_ms, duration_ms, …)`; the browser sends only the option index.
* `pause_game` stores `paused_remaining_ms`; `resume_game` sets `question_ends_at = now() + remaining`.
* Clients render a countdown from `question_ends_at` corrected by a clock offset estimated from
  `server_now` (`src/features/game/clock.ts`). Clients never decide validity.
* `get_player_state` hides `correct_index`, `explanation`, `is_correct`, `points` until the deadline, and
  subtracts the pending answer's points from score/rank so correctness cannot leak early.

## Security

* RLS enabled on every table; privileges revoked from `anon`/`authenticated` and re-granted minimally.
  Column-level `UPDATE` grants prevent changing `teacher_id`. Students have no INSERT/UPDATE on any table.
* Helper predicates (`is_session_teacher`, `is_session_participant`, …) are `SECURITY DEFINER` to avoid
  recursive policy evaluation.
* All `SECURITY DEFINER` functions use `set search_path = ''` and fully qualified names.
* `join_game` is rate limited (10/min per auth user). Failed attempts are *returned* as `{error}` rather than
  raised so the attempt log row commits (a raise would roll it back — caught by the DB tests).
* Edge Function: verifies the user via `auth.getUser`, rejects anonymous users and users without a profile,
  validates the body with Zod, limits body size, enforces per-teacher hourly/daily limits through
  `ai_generation_log` (RLS: insert/select own), never logs prompts/material, re-validates model output.

## Adding tables later

Supabase grants default privileges on new public tables to `anon`/`authenticated`. Any new table must
`enable row level security` and explicitly `revoke`/`grant` like `20261021000002_security.sql`, and any new
function must be explicitly granted (the migrations revoke EXECUTE from PUBLIC).

## Tests

* `tests/db/run.sh` — throwaway PostgreSQL cluster, `tests/db/supabase_stub.sql` emulates `auth.uid()`,
  roles and the realtime publication; SQL assertions in `tests/db/*.test.sql`.
* `tests/unit` — Vitest + RTL: schema validation, scoring, timer, AI error mapping, prompt, analytics,
  recommendations, CSV, file extraction, quiz model, auth guard and components.

## Chart colours

Answer colours for chart marks were checked with the dataviz palette validator: `#d4382c, #2563eb,
#c27d00, #15803d` passes lightness/chroma/contrast; the protan ΔE between amber and green is in the 6–8
"floor" band, which is acceptable only with secondary encoding — every option bar is also labelled with its
letter, shape and text. The brighter `#f2a20c` amber is used only for game tiles, which carry dark text and
a shape icon.
