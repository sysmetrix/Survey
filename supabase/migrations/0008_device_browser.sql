-- 관리자 사용 통계 고도화 2탄: 접속 기기(PC·모바일·태블릿)·브라우저 분포.
-- org·src(0004)와 같은 자리(usage_events 최상위 컬럼, 모든 이벤트에 함께 실림) —
-- 개인 식별과 무관하고(브라우저 종류일 뿐), User-Agent 원문은 저장하지 않는다(js/telemetry/track.js
-- classifyUserAgent() 가 클라이언트에서 "PC/모바일/태블릿"·"Chrome/Edge/Safari/Firefox/삼성 인터넷/기타"
-- 로만 분류해서 보낸다 — 원문 UA 문자열은 서버로 전송조차 되지 않음).

alter table public.usage_events add column if not exists device text;
alter table public.usage_events add column if not exists browser text;

create or replace view public.usage_device_counts
with (security_invoker = true) as
select
  coalesce(nullif(device, ''), '(알 수 없음)') as device,
  count(*)::int as count,
  count(distinct anon_id)::int as distinct_sessions
from public.usage_events
where event = 'view_enter'
group by 1
order by count(*) desc;
grant select on public.usage_device_counts to authenticated;

create or replace view public.usage_browser_counts
with (security_invoker = true) as
select
  coalesce(nullif(browser, ''), '(알 수 없음)') as browser,
  count(*)::int as count,
  count(distinct anon_id)::int as distinct_sessions
from public.usage_events
where event = 'view_enter'
group by 1
order by count(*) desc;
grant select on public.usage_browser_counts to authenticated;

-- track_events() 를 device·browser 도 함께 저장하도록 교체(그 밖의 검증 로직은 0004와 동일)
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
  v_device       text;
  v_browser      text;
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
      v_device := nullif(left(ev ->> 'device', 20), '');
      v_browser := nullif(left(ev ->> 'browser', 20), '');
      if v_view is null or v_event is null or v_anon is null then
        continue;
      end if;
      if not (v_view = any (allowed_views)) or not (v_event = any (allowed_events)) then
        continue;
      end if;
      v_extra := case when jsonb_typeof(ev -> 'extra') = 'object' then ev -> 'extra' else null end;
      insert into public.usage_events (anon_id, view, event, extra, app_version, org, src, device, browser)
      values (v_anon, v_view, v_event, v_extra, v_app_version, v_org, v_src, v_device, v_browser);
    exception when others then
      continue;
    end;
  end loop;
end;
$$;
revoke all on function public.track_events(jsonb) from public;
grant execute on function public.track_events(jsonb) to anon, authenticated;
