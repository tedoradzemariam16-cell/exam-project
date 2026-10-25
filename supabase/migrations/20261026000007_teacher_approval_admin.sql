-- =====================================================================
-- Teacher approval + administrator.
--   * A new teacher account starts as 'pending'. Until an administrator
--     approves it, it cannot create or change quizzes, start games or use
--     AI generation (public.is_teacher() now means "approved teacher").
--   * Administrators (profiles.is_admin) approve / reject teachers and can
--     READ every teacher's quizzes and results. They cannot change or
--     delete other teachers' content through the app.
--   * Nobody can make themselves an admin or approve themselves from the
--     client: status/is_admin are not client-updatable columns. The first
--     admin is set once in the SQL editor (see README).
-- =====================================================================

-- Existing teachers keep working: add the column as 'approved', then make
-- 'pending' the default for everyone who registers from now on.
alter table public.profiles
  add column status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected')),
  add column is_admin boolean not null default false,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles (id) on delete set null;
alter table public.profiles alter column status set default 'pending';

create index profiles_status_idx on public.profiles (status);

-- ---------------------------------------------------------------------
-- Predicates
-- ---------------------------------------------------------------------
create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved');
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin and status = 'approved');
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- Writes need an approved teacher. A trigger also covers the SECURITY
-- DEFINER functions (save_quiz_content, duplicate_quiz, ...), which bypass
-- RLS. Deletes stay allowed so a pending user can delete their account.
-- Statements without a signed-in user (SQL editor, migrations) pass.
-- ---------------------------------------------------------------------
create function public.require_approved_teacher() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_teacher() then
    perform public.raise_app_error('NOT_APPROVED');
  end if;
  return coalesce(new, old);
end;
$$;

create trigger quizzes_require_approved before insert or update on public.quizzes
  for each row execute function public.require_approved_teacher();
create trigger objectives_require_approved before insert or update on public.learning_objectives
  for each row execute function public.require_approved_teacher();
create trigger questions_require_approved before insert or update on public.questions
  for each row execute function public.require_approved_teacher();
create trigger options_require_approved before insert or update on public.answer_options
  for each row execute function public.require_approved_teacher();
create trigger sessions_require_approved before insert on public.game_sessions
  for each row execute function public.require_approved_teacher();

-- Account deletion must work for any registered (also pending) user.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    perform public.raise_app_error('NOT_TEACHER');
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- Administrators can read everything (read-only)
-- ---------------------------------------------------------------------
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());
create policy quizzes_select_admin on public.quizzes
  for select to authenticated using (public.is_admin());
create policy objectives_select_admin on public.learning_objectives
  for select to authenticated using (public.is_admin());
create policy questions_select_admin on public.questions
  for select to authenticated using (public.is_admin());
create policy options_select_admin on public.answer_options
  for select to authenticated using (public.is_admin());
create policy sessions_select_admin on public.game_sessions
  for select to authenticated using (public.is_admin());
create policy session_questions_select_admin on public.session_questions
  for select to authenticated using (public.is_admin());
create policy participants_select_admin on public.participants
  for select to authenticated using (public.is_admin());
create policy answers_select_admin on public.answers
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Admin functions
-- ---------------------------------------------------------------------
create function public.admin_list_teachers()
returns table (
  id uuid,
  full_name text,
  school text,
  email text,
  status text,
  is_admin boolean,
  created_at timestamptz,
  reviewed_at timestamptz,
  quiz_count bigint,
  session_count bigint,
  last_session_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    perform public.raise_app_error('NOT_ADMIN');
  end if;
  return query
    select p.id, p.full_name, p.school, u.email::text, p.status, p.is_admin, p.created_at, p.reviewed_at,
           (select count(*) from public.quizzes z where z.teacher_id = p.id),
           (select count(*) from public.game_sessions s where s.teacher_id = p.id),
           (select max(s.created_at) from public.game_sessions s where s.teacher_id = p.id)
      from public.profiles p
      join auth.users u on u.id = p.id
     order by (p.status = 'pending') desc, p.created_at desc;
end;
$$;

create function public.admin_set_teacher_status(p_teacher uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    perform public.raise_app_error('NOT_ADMIN');
  end if;
  if p_status not in ('approved', 'rejected') then
    perform public.raise_app_error('INVALID_REQUEST');
  end if;
  if p_teacher = auth.uid() then
    perform public.raise_app_error('CANNOT_CHANGE_SELF');
  end if;
  update public.profiles
     set status = p_status, reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_teacher and not is_admin;
  if not found then
    perform public.raise_app_error('TEACHER_NOT_FOUND');
  end if;
end;
$$;

-- Remove an account that should not exist (e.g. a stranger's registration).
-- Only for accounts that are not approved, so real work cannot be lost by a
-- single click: an approved teacher must be rejected first.
create function public.admin_delete_teacher(p_teacher uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    perform public.raise_app_error('NOT_ADMIN');
  end if;
  if p_teacher = auth.uid() then
    perform public.raise_app_error('CANNOT_CHANGE_SELF');
  end if;
  if not exists (select 1 from public.profiles where id = p_teacher and status <> 'approved' and not is_admin) then
    perform public.raise_app_error('TEACHER_NOT_FOUND');
  end if;
  delete from auth.users where id = p_teacher;
end;
$$;

revoke execute on function public.admin_list_teachers() from public, anon;
revoke execute on function public.admin_set_teacher_status(uuid, text) from public, anon;
revoke execute on function public.admin_delete_teacher(uuid) from public, anon;
revoke execute on function public.require_approved_teacher() from public, anon, authenticated;
grant execute on function public.admin_list_teachers() to authenticated;
grant execute on function public.admin_set_teacher_status(uuid, text) to authenticated;
grant execute on function public.admin_delete_teacher(uuid) to authenticated;
