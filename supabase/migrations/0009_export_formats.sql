-- 관리자 사용 통계 고도화 3탄: 보고서·발표 내보내기 4종(HWPX·PPTX·HTML·PDF)을 모두 집계.
-- 지금까지는 export_hwpx·export_pptx 만 허용돼 있어 발표 HTML 내려받기·인쇄(PDF 저장)는 아예
-- 전송조차 되지 않았다(js/main.js survey:exported 는 진작 present-html·pdf 종류를 받고 있었지만
-- track_events() 의 allowed_events 에 없어 서버가 조용히 버렸다). usage_daily_counts(0002)는
-- event 를 미리 고정하지 않고 있는 그대로 집계하므로, 여기서는 RPC의 허용 목록만 넓히면 된다
-- (새 뷰는 필요 없음 — 화면은 usage_daily_counts 를 그대로 씀).

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
  allowed_events constant text[] := array['view_enter', 'export_hwpx', 'export_pptx', 'export_html', 'export_pdf', 'sample_load', 'js_error'];
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
