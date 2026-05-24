begin;
  drop function if exists public.increment_views(uuid, text) cascade;
  drop function if exists public.increment_profile_usage(uuid, bigint, bigint) cascade;

  drop table if exists public.bundle_comments cascade;
  drop table if exists public.bundle_reactions cascade;
  drop table if exists public.api_keys cascade;
  drop table if exists public.vanity_urls cascade;
  drop table if exists public.uploads cascade;
  drop table if exists public.bundles cascade;
  drop table if exists public.dmca_requests cascade;
  drop table if exists public.reports cascade;
  drop table if exists public.profiles cascade;
commit;
