-- 관리자 사용 통계 고도화: 샘플 파일 인기도 · 앱 버전 분포 뷰 추가.
-- 둘 다 usage_daily_counts(0002)가 담지 않는 extra(json)·app_version 기준 집계라 새 뷰가 필요하다.
-- 기존 뷰·RLS·track_events()는 그대로 둔다(스키마·allow-list 변경 없음 — sample_load 이벤트와
-- extra.file 키는 0001부터 이미 허용돼 있었는데 화면에서 그동안 쓰지 않았을 뿐이다).

-- 샘플 파일별 "체험하기" 클릭 수 — 어떤 샘플이 첫인상에 잘 먹히는지
create or replace view public.usage_sample_counts
with (security_invoker = true) as
select
  coalesce(nullif(extra ->> 'file', ''), '(알 수 없음)') as file,
  count(*)::int as count,
  count(distinct anon_id)::int as distinct_sessions
from public.usage_events
where event = 'sample_load'
group by 1
order by count(*) desc;
grant select on public.usage_sample_counts to authenticated;

-- 앱 버전별 방문 — 배포 직후 이전 버전 캐시가 얼마나 남아 있는지 확인용
create or replace view public.usage_version_counts
with (security_invoker = true) as
select
  coalesce(nullif(app_version, ''), '(알 수 없음)') as version,
  count(*)::int as count,
  count(distinct anon_id)::int as distinct_sessions,
  max(created_at) as last_seen
from public.usage_events
where event = 'view_enter'
group by 1
order by max(created_at) desc;
grant select on public.usage_version_counts to authenticated;
