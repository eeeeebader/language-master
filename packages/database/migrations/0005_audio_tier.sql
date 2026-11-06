-- Audio packs come in two tiers: "core" (most frequent headwords + lectures + official stories,
-- installed for everyone in the background) and "full" (every headword, opt-in download).
alter table public.dictionary_packs add column if not exists audio_tier text;
update public.dictionary_packs set audio_tier = 'core' where with_audio and audio_tier is null;
drop index if exists public.dictionary_packs_uq;
create unique index if not exists dictionary_packs_uq
  on public.dictionary_packs (target, native, version, with_audio, audio_tier) nulls not distinct;
