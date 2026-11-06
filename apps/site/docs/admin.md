# Admin console

`apps/admin`: same stack as the app, separate deploy, Supabase role claim (admin | editor | analyst)
enforced by RLS, 2FA required, behind an IP allow-list. Mock mode without env for UI work.

Modules:

- **Users**: search, a management panel per user with Premium and Supporter switches, a per-user
  override of the daily free stories, token booking with a reason (token ledger), consents,
  export (Art. 15) and deletion (Art. 17).
- **Limits**: app-wide settings grouped into Geschichten, Sprachmodell, Preise and Betrieb with
  typed controls; versioned and audited; `billing.field_test` turns on the dry-test mode where
  every purchase is granted.
- **Sprachen**: study languages with their two native parents (Deutsch, English); pack version,
  audio and published lectures per parent; a pair goes live with a pack and eight lectures.
- **Content**: lectures with live preview, dictionary packs and overrides, official stories.
- **Legal, Changelog, Jobs, Betrieb (ops), Finanzen, Analytics, Feature Flags, Audit-Log.**

Every write goes through the API and lands in `audit_log`. See `apps/admin/README.md` for the
API contract.
