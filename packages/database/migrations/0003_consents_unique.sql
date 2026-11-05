-- One consent row per (user, document, version); concurrent clients may record the same consent.
delete from public.consents a using public.consents b
  where a.user_id = b.user_id and a.document = b.document and a.version = b.version and a.id > b.id;
create unique index if not exists consents_user_doc_version_uq on public.consents (user_id, document, version);
