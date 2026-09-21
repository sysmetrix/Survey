-- Phase 1: 계정(profiles) · 접속 감사 로그(access_log) · 익명 사용 이벤트(usage_events)
-- 설계 원칙(plan 문서 참고): usage_events 는 auth.users 를 가리키는 컬럼이 전혀 없다 — RLS 로 숨기는 게
-- 아니라 스키마 자체에 "누가"를 담을 자리가 없다. 쓰기는 오직 track_events() RPC 로만 허용되고
-- 화면·이벤트 이름은 이 파일 안의 allow-list로 서버 쪽에서도 다시 검증한다(클라이언트 우회 방어).

-- ── 계정 ──────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  role          text not null default 'staff' check (role in ('staff', 'admin')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id),
  last_login_at timestamptz
);
create index profiles_role_idx on public.profiles (role);

-- profiles 자기 자신을 참조하는 RLS 정책에서 무한 재귀를 피하려고 security definer 로 분리
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

alter table public.profiles enable row level security;

create policy "profiles_select_self_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "profiles_update_admin_only" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- insert 정책은 의도적으로 없음 — 계정 생성은 관리자 전용 Edge Function(service role)이나
-- Supabase 대시보드에서만 한다(Phase 1에는 그 함수가 아직 없으므로 최초 계정은 대시보드에서 수동 생성).

-- ── 접속 감사 로그 ────────────────────────────────────────────────────
-- IP·User-Agent 는 저장하지 않는다 — Supabase 자체 Auth 로그가 그 계층을 이미 담당한다.
create table public.access_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id),
  event      text not null check (event in ('login', 'logout')),
  created_at timestamptz not null default now()
);
create index access_log_user_created_idx on public.access_log (user_id, created_at);

alter table public.access_log enable row level security;

create policy "access_log_select_admin" on public.access_log
  for select using (public.is_admin());
-- insert 정책 없음 — 오직 아래 log_login() RPC(security definer)를 통해서만 기록

create or replace function public.log_login(p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event not in ('login', 'logout') then
    raise exception 'invalid event';
  end if;
  insert into public.access_log (user_id, event) values (auth.uid(), p_event);
  if p_event = 'login' then
    update public.profiles set last_login_at = now() where id = auth.uid();
  end if;
end;
$$;
revoke all on function public.log_login(text) from public;
grant execute on function public.log_login(text) to authenticated;

-- ── 익명 사용 이벤트 ──────────────────────────────────────────────────
create table public.usage_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  anon_id     uuid not null,   -- 브라우저 세션마다 랜덤 생성(sessionStorage 전용) — 로그인 계정과 무관
  view        text not null,
  event       text not null,
  extra       jsonb,           -- 이벤트별 허용 키만 (js/telemetry/track.js 의 ALLOW 와 이 파일의 allow-list 이중 검증)
  app_version text
);
create index usage_events_view_event_created_idx on public.usage_events (view, event, created_at);

alter table public.usage_events enable row level security;

create policy "usage_events_select_admin" on public.usage_events
  for select using (public.is_admin());
-- insert 정책 없음 — 오직 아래 track_events() RPC(security definer)를 통해서만 기록

create or replace function public.track_events(events jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ev             jsonb;
  v_view         text;
  v_event        text;
  v_anon         uuid;
  v_app_version  text;
  v_extra        jsonb;
  allowed_views  constant text[] := array['load', 'setup', 'business', 'dash', 'report', 'present', 'presentEdit', 'history', 'settings', 'updates', 'login', 'admin'];
  allowed_events constant text[] := array['view_enter', 'export_hwpx', 'export_pptx', 'sample_load', 'js_error'];
begin
  if jsonb_typeof(events) is distinct from 'array' then
    return;
  end if;
  if jsonb_array_length(events) > 20 then
    return; -- 배치 크기 상한(클라이언트와 동일) — 넘으면 통째로 버림
  end if;
  for ev in select * from jsonb_array_elements(events) loop
    begin
      v_view := ev ->> 'view';
      v_event := ev ->> 'event';
      v_anon := nullif(ev ->> 'anon_id', '')::uuid;
      v_app_version := left(ev ->> 'app_version', 20);
      if v_view is null or v_event is null or v_anon is null then
        continue;
      end if;
      if not (v_view = any (allowed_views)) or not (v_event = any (allowed_events)) then
        continue;
      end if;
      v_extra := case when jsonb_typeof(ev -> 'extra') = 'object' then ev -> 'extra' else null end;
      insert into public.usage_events (anon_id, view, event, extra, app_version)
      values (v_anon, v_view, v_event, v_extra, v_app_version);
    exception when others then
      continue; -- 값 하나가 이상해도 나머지 배치는 계속 처리
    end;
  end loop;
end;
$$;
revoke all on function public.track_events(jsonb) from public;
-- anon 도 포함: 일반 이용자는 로그인하지 않으므로 익명 통계는 비로그인 상태에서도 기록돼야 한다
grant execute on function public.track_events(jsonb) to anon, authenticated;
