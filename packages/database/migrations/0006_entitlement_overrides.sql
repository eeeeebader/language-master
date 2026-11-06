-- Per-user override of the daily free stories (null = app setting). Lets admins give friends and
-- testers more free generations without touching the global limit.
alter table public.entitlements add column if not exists free_stories_per_day integer;
