-- track_events 서버 검증 강화: 근거자료 화면('references') 허용, extra 형식·크기 제한.
-- extra 가 있는데 JSON 객체가 아니거나 1KB(pg_column_size)를 넘으면 그 이벤트는 저장하지 않는다(없으면 기존처럼 null 로 저장).
-- 서명·권한·security definer 설정은 0012_usage_stats_v3.sql 정의와 같다.
create or replace function public.track_events(events jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare ev jsonb; v_view text; v_event text; v_anon uuid; v_extra jsonb;
  v_app_version text; v_org text; v_src text; v_device text; v_browser text;
  allowed_views constant text[] := array['load','setup','business','dash','report','present','presentEdit','history','settings','updates','login','admin','references'];
  allowed_events constant text[] := array['view_enter','export_hwpx','export_pptx','export_html','export_pdf','sample_load','js_error','file_load','file_load_error','analysis_complete','report_started','report_complete','present_started','present_complete','export_error'];
begin
  if jsonb_typeof(events) is distinct from 'array' or jsonb_array_length(events) > 20 then return; end if;
  for ev in select * from jsonb_array_elements(events) loop begin
    v_view := ev ->> 'view'; v_event := ev ->> 'event'; v_anon := nullif(ev ->> 'anon_id','')::uuid;
    v_app_version := left(ev ->> 'app_version',20); v_org := nullif(left(ev ->> 'org',60),''); v_src := nullif(left(ev ->> 'src',60),'');
    v_device := nullif(left(ev ->> 'device',20),''); v_browser := nullif(left(ev ->> 'browser',20),'');
    if v_view is null or v_event is null or v_anon is null or not (v_view = any(allowed_views)) or not (v_event = any(allowed_events)) then continue; end if;
    v_extra := ev -> 'extra';
    if jsonb_typeof(v_extra) = 'null' then v_extra := null; end if;
    if v_extra is not null and (jsonb_typeof(v_extra) <> 'object' or pg_column_size(v_extra) > 1024) then continue; end if;
    insert into public.usage_events(anon_id,view,event,extra,app_version,org,src,device,browser) values(v_anon,v_view,v_event,v_extra,v_app_version,v_org,v_src,v_device,v_browser);
  exception when others then continue; end; end loop;
end; $$;
revoke all on function public.track_events(jsonb) from public;
grant execute on function public.track_events(jsonb) to anon, authenticated;
