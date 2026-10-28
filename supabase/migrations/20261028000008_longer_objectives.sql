-- Learning objectives may be long (several sentences). Raise the limits from
-- 500 / 1000 characters to 5000 per objective.
alter table public.quizzes drop constraint if exists quizzes_learning_objective_check;
alter table public.quizzes
  add constraint quizzes_learning_objective_check check (char_length(learning_objective) <= 5000);

alter table public.learning_objectives drop constraint if exists learning_objectives_title_check;
alter table public.learning_objectives
  add constraint learning_objectives_title_check check (char_length(btrim(title)) between 1 and 5000);
