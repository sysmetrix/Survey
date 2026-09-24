insert into public.feature_flags (key, enabled)
values ('referenceEvidence', false)
on conflict (key) do nothing;
