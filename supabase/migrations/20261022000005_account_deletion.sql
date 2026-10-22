-- Self-service account deletion for teachers. Deleting the auth user
-- cascades to the profile, quizzes, sessions, participants and answers.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_teacher() then
    perform public.raise_app_error('NOT_TEACHER');
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
