-- 관리자 기능 플래그 2종 추가: 성과지표 추이 막대(kpiTrendChart), 응답자 대표성 결과의
-- 한글(HWPX) 보고서 반영(representativenessInReport). 테이블·RLS는 0005에서 이미 만들어짐.
insert into public.feature_flags (key, enabled) values
  ('kpiTrendChart', false),
  ('representativenessInReport', false)
on conflict (key) do nothing;
