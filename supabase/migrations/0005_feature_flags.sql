-- 통계 신뢰도 고도화 4종(소표본 경고·KPI 목표 적정성·응답자 대표성·통계 신뢰 배지)을
-- 관리자 전용 미리보기로 먼저 배포하고, 안정화되면 관리자가 전체 공개로 전환할 수 있게 하는
-- 기능 플래그. announcements(0003)와 동일한 패턴: 공개 읽기, 관리자만 쓰기.

create table public.feature_flags (
  key         text primary key,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

alter table public.feature_flags enable row level security;

-- 플래그 값 자체는 민감정보가 아니며, 로그인하지 않은 일반 직원 화면에서도
-- "전체 공개로 전환됐는지" 확인할 수 있어야 하므로 anon 포함 전체 공개 읽기.
create policy "feature_flags_select_all" on public.feature_flags
  for select using (true);
create policy "feature_flags_insert_admin" on public.feature_flags
  for insert with check (public.is_admin());
create policy "feature_flags_update_admin" on public.feature_flags
  for update using (public.is_admin()) with check (public.is_admin());
create policy "feature_flags_delete_admin" on public.feature_flags
  for delete using (public.is_admin());

grant select on public.feature_flags to anon, authenticated;
grant insert, update, delete on public.feature_flags to authenticated;

create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();

create or replace function public.set_feature_flag(p_key text, p_enabled boolean)
returns public.feature_flags
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row public.feature_flags;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  insert into public.feature_flags (key, enabled, updated_by)
  values (p_key, p_enabled, auth.uid())
  on conflict (key) do update set enabled = excluded.enabled, updated_by = excluded.updated_by
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.set_feature_flag(text, boolean) from public;
grant execute on function public.set_feature_flag(text, boolean) to authenticated;

-- 초기 4개 플래그(모두 기본 비공개 = 관리자만 미리보기)
insert into public.feature_flags (key, enabled) values
  ('smallSampleWarning', false),
  ('kpiTargetAdequacy', false),
  ('respondentRepresentativeness', false),
  ('statsTrustBadge', false)
on conflict (key) do nothing;
