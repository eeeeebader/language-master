# Admin console

`apps/admin`: same stack as the app, separate deploy, Supabase role claim (admin | editor | analyst)
enforced by RLS, 2FA required, behind an IP allow-list. Modules: Users, Limits, Legal, Changelog,
Jobs, Content (lectures, dictionary, official stories), Languages, Finance, Analytics, Feature flags.
Every write goes through the API and lands in `audit_log`. See `apps/admin/README.md` for the API
contract.
