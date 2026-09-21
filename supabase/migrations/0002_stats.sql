-- Phase 2: 관리자 통계 대시보드가 읽는 뷰 + 오래된 원본 이벤트 정리용 RPC.
-- pg_cron 자동 롤업 대신 온디맨드 VIEW로 단순화했다(이 규모의 트래픽에서는 실시간 집계로도 충분하고,
-- 프로젝트마다 pg_cron 확장 활성화 여부가 달라 설정이 더 번거롭다).

create or replace view public.usage_daily_counts
with (security_invoker = true) as
select
  (created_at at time zone 'utc')::date as day,
  view,
  event,
  count(*)::int as count,
  count(distinct anon_id)::int as distinct_sessions
from public.usage_events
group by 1, 2, 3;

-- security_invoker=true 이므로 조회자 자신의 RLS(usage_events_select_admin)가 그대로 적용된다.
-- 즉 admin 이 아니면 그냥 빈 결과가 나올 뿐, 이 뷰 자체에 별도 권한 검사를 넣을 필요가 없다.
grant select on public.usage_daily_counts to authenticated;

create or replace function public.cleanup_old_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  delete from public.usage_events where created_at < now() - interval '90 days';
end;
$$;
revoke all on function public.cleanup_old_events() from public;
grant execute on function public.cleanup_old_events() to authenticated;
