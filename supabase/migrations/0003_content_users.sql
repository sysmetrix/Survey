-- Phase 3: 공지(announcements) — js/admin/releases.js 하드코딩 배열을 대신함.
-- Phase 4: register_profile() — service_role/Edge Function 없이도 "Supabase 대시보드에서
-- 이메일·비밀번호 계정만 먼저 만들면, 이 앱 안에서 표시 이름·역할을 지정"할 수 있게 하는 RPC.
-- (auth.users 는 PostgREST API 로는 안 보이지만, SQL 함수 안에서는 그대로 조회할 수 있다.)

create table public.announcements (
  id           bigint generated always as identity primary key,
  version      text,
  release_date date not null default current_date,
  title        text not null,
  groups       jsonb not null default '{}',
  published    boolean not null default true,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.announcements enable row level security;

-- 공개(published) 공지는 로그인 여부와 무관하게 누구나 읽음(일반 직원은 로그인하지 않으므로)
create policy "announcements_select_published" on public.announcements
  for select using (published);
create policy "announcements_select_admin_all" on public.announcements
  for select using (public.is_admin());
create policy "announcements_insert_admin" on public.announcements
  for insert with check (public.is_admin());
create policy "announcements_update_admin" on public.announcements
  for update using (public.is_admin()) with check (public.is_admin());
create policy "announcements_delete_admin" on public.announcements
  for delete using (public.is_admin());

grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

create or replace function public.register_profile(p_email text, p_display_name text, p_role text default 'staff')
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_row public.profiles;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  if p_role not in ('staff', 'admin') then
    raise exception 'invalid role';
  end if;
  select id into v_user_id from auth.users where email = p_email;
  if v_user_id is null then
    raise exception '해당 이메일로 가입된 계정이 없습니다. 먼저 Supabase 대시보드(Authentication)에서 계정을 만드세요.';
  end if;
  insert into public.profiles (id, display_name, role, is_active, created_by)
  values (v_user_id, p_display_name, p_role, true, auth.uid())
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, is_active = true
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.register_profile(text, text, text) from public;
grant execute on function public.register_profile(text, text, text) to authenticated;
