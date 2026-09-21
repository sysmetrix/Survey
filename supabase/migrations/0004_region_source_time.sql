-- 전국 배포 대비: 기관명 기준 지역 구분(org) · 배포 링크 구분 태그(src) · 시간대 분석.
-- org·src 는 usage_events 의 최상위 컬럼으로 추가한다(이벤트별 extra 안에 넣지 않음 — 모든
-- 이벤트를 똑같이 이 기준으로 나눠 볼 수 있어야 하므로). 둘 다 여전히 개인 식별과 무관하다:
-- org 는 로컬 설정에 이미 입력하는 기관명(설문 데이터 아님), src 는 배포자가 직접 붙이는 태그일 뿐
-- 방문자 개인과는 무관하다. 실제 접속 IP·위치·리퍼러는 여전히 보지 않는다(README 약속 유지).

alter table public.usage_events add column if not exists org text;
alter table public.usage_events add column if not exists src text;

-- 기관(지역)별 방문 — 상위 N개를 대시보드에서 보여줌
create or replace view public.usage_org_counts
with (security_invoker = true) as
select
  coalesce(nullif(org, ''), '(미상)') as org,
  count(*)::int as count,
  count(distinct anon_id)::int as distinct_sessions
from public.usage_events
where event = 'view_enter'
group by 1
order by count(*) desc;
grant select on public.usage_org_counts to authenticated;

-- 배포 경로(캠페인 태그)별 방문
create or replace view public.usage_src_counts
with (security_invoker = true) as
select
  coalesce(nullif(src, ''), '(직접 접속)') as src,
  count(*)::int as count,
  count(distinct anon_id)::int as distinct_sessions
from public.usage_events
where event = 'view_enter'
group by 1
order by count(*) desc;
grant select on public.usage_src_counts to authenticated;

-- 시간대별 사용(한국 시간 기준) — 새 이벤트 컬럼 필요 없이 기존 created_at 만으로 계산
create or replace view public.usage_hourly_counts
with (security_invoker = true) as
select
  extract(hour from created_at at time zone 'Asia/Seoul')::int as hour_kst,
  count(*)::int as count,
  count(distinct anon_id)::int as distinct_sessions
from public.usage_events
where event = 'view_enter'
group by 1
order by 1;
grant select on public.usage_hourly_counts to authenticated;

-- track_events() 를 org·src 도 함께 저장하도록 교체(그 밖의 검증 로직은 이전과 동일)
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
  v_org          text;
  v_src          text;
  allowed_views  constant text[] := array['load', 'setup', 'business', 'dash', 'report', 'present', 'presentEdit', 'history', 'settings', 'updates', 'login', 'admin'];
  allowed_events constant text[] := array['view_enter', 'export_hwpx', 'export_pptx', 'sample_load', 'js_error'];
begin
  if jsonb_typeof(events) is distinct from 'array' then
    return;
  end if;
  if jsonb_array_length(events) > 20 then
    return;
  end if;
  for ev in select * from jsonb_array_elements(events) loop
    begin
      v_view := ev ->> 'view';
      v_event := ev ->> 'event';
      v_anon := nullif(ev ->> 'anon_id', '')::uuid;
      v_app_version := left(ev ->> 'app_version', 20);
      v_org := nullif(left(ev ->> 'org', 60), '');
      v_src := nullif(left(ev ->> 'src', 60), '');
      if v_view is null or v_event is null or v_anon is null then
        continue;
      end if;
      if not (v_view = any (allowed_views)) or not (v_event = any (allowed_events)) then
        continue;
      end if;
      v_extra := case when jsonb_typeof(ev -> 'extra') = 'object' then ev -> 'extra' else null end;
      insert into public.usage_events (anon_id, view, event, extra, app_version, org, src)
      values (v_anon, v_view, v_event, v_extra, v_app_version, v_org, v_src);
    exception when others then
      continue;
    end;
  end loop;
end;
$$;
revoke all on function public.track_events(jsonb) from public;
grant execute on function public.track_events(jsonb) to anon, authenticated;
