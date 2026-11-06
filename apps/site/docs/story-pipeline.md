# Story pipeline

Two small LLM calls around a deterministic NLP pass. No free text from the learner reaches the
model: every input is an enum or a lemma list.

```mermaid
flowchart TD
  I[Inputs: known lemmas ≤600, failed lemmas, novelty, theme, level, length, grammar focus] --> Q[Quota gate: token debit in one transaction]
  Q --> W[LLM write: prose]
  W --> N[spaCy: tokens, lemmas, POS, morphology]
  N --> K{Coverage within ~5 pp and failed words used?}
  K -- no, once --> W
  K -- yes --> G[LLM grammar notes: structured output]
  G --> Z[Zod validation: spans resolve to tokens]
  Z -- invalid, once --> G
  Z --> M[Moderation classifier]
  M --> S[(stories + llm_usage)]
  Z -- fails twice --> R[Refund token]
```

Cost per story at length 2 is roughly 0.01 €. Official texts skip the quota gate and the writer call.
As a last step the API voices every word form, sentence and the whole story through Piper and
ships the clips with the response, so a new story reads offline immediately.

Status: the pipeline and reader work; the generation screen states, archive limits by tier and a
rating loop are still open (see `docs/review-2026-11-06.md`).
