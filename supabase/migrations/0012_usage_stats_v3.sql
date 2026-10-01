-- 관리자 사용 통계 고도화: 운영 행동 이벤트와 장기 비식별 일별 집계.
-- 원본 usage_events는 기존처럼 90일 보존하고, 집계 결과만 장기 보존한다.
insert into public.feature_flags (key, enabled) values ('operationalUsageStats', false) on conflict (key) do nothing;

create table if not exists public.usage_daily_rollups (
  day date not null,
  view text not null,
  event text not null,
  org text not null default '',
  src text not null default '',
  app_version text not null default '',
  device text not null default '',
  browser text not null default '',
  event_count integer not null default 0,
  distinct_sessions integer not null default 0,
  primary key (day, view, event, org, src, app_version, device, browser)
);
alter table public.usage_daily_rollups enable row level security;
drop policy if exists "usage_daily_rollups_select_admin" on public.usage_daily_rollups;
create policy "usage_daily_rollups_select_admin" on public.usage_daily_rollups for select using (public.is_admin());
grant select on public.usage_daily_rollups to authenticated;

create or replace view public.usage_action_counts with (security_invoker = true) as
select (created_at at time zone 'utc')::date as day, view, event,
  count(*)::int as count, count(distinct anon_id)::int as distinct_sessions,
  count(*) filter (where event in ('file_load_error','export_error','js_error'))::int as error_count
from public.usage_events
where event in ('file_load','file_load_error','analysis_complete','report_started','report_complete',
  'present_started','present_complete','export_error','js_error')
group by 1,2,3;
grant select on public.usage_action_counts to authenticated;

create or replace function public.refresh_usage_daily_rollups(p_from date default current_date - 90)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  insert into public.usage_daily_rollups
  select (created_at at time zone 'utc')::date, view, event,
    coalesce(org,''), coalesce(src,''), coalesce(app_version,''), coalesce(device,''), coalesce(browser,''),
    count(*)::int, count(distinct anon_id)::int
  from public.usage_events where created_at >= p_from
  group by 1,2,3,4,5,6,7,8
  on conflict (day, view, event, org, src, app_version, device, browser)
  do update set event_count=excluded.event_count, distinct_sessions=excluded.distinct_sessions;
end; $$;
revoke all on function public.refresh_usage_daily_rollups(date) from public;
grant execute on function public.refresh_usage_daily_rollups(date) to authenticated;


-- 클라이언트 allow-list와 동일하게 서버에서도 운영 이벤트를 검증한다.
create or replace function public.track_events(events jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare ev jsonb; v_view text; v_event text; v_anon uuid; v_extra jsonb;
  v_app_version text; v_org text; v_src text; v_device text; v_browser text;
  allowed_views constant text[] := array['load','setup','business','dash','report','present','presentEdit','history','settings','updates','login','admin'];
  allowed_events constant text[] := array['view_enter','export_hwpx','export_pptx','export_html','export_pdf','sample_load','js_error','file_load','file_load_error','analysis_complete','report_started','report_complete','present_started','present_complete','export_error'];
begin
  if jsonb_typeof(events) is distinct from 'array' or jsonb_array_length(events) > 20 then return; end if;
  for ev in select * from jsonb_array_elements(events) loop begin
    v_view := ev ->> 'view'; v_event := ev ->> 'event'; v_anon := nullif(ev ->> 'anon_id','')::uuid;
    v_app_version := left(ev ->> 'app_version',20); v_org := nullif(left(ev ->> 'org',60),''); v_src := nullif(left(ev ->> 'src',60),'');
    v_device := nullif(left(ev ->> 'device',20),''); v_browser := nullif(left(ev ->> 'browser',20),'');
    if v_view is null or v_event is null or v_anon is null or not (v_view = any(allowed_views)) or not (v_event = any(allowed_events)) then continue; end if;
    v_extra := case when jsonb_typeof(ev -> 'extra') = 'object' then ev -> 'extra' else null end;
    insert into public.usage_events(anon_id,view,event,extra,app_version,org,src,device,browser) values(v_anon,v_view,v_event,v_extra,v_app_version,v_org,v_src,v_device,v_browser);
  exception when others then continue; end; end loop;
end; $$;
revoke all on function public.track_events(jsonb) from public;
grant execute on function public.track_events(jsonb) to anon, authenticated;
