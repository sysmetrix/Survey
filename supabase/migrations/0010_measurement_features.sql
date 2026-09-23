-- 이미 존재하는 공개 설정은 보존한다.
insert into public.feature_flags (key, enabled) values
  ('measurementQuality', false), ('surveyVersioning', false),
  ('ageSurveyTemplates', false), ('competencyProfile', false),
  ('standardComparisons', false), ('guidedKpiSetup', false)
on conflict (key) do nothing;
