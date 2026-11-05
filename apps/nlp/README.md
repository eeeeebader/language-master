# apps/nlp

FastAPI + spaCy (`es_core_news_md`) annotation service. Internal only; the Hono API calls it.

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]" && python -m spacy download es_core_news_md
uvicorn app.main:app --port 8080 --reload
pytest
```

`POST /annotate {"text": "...", "language": "es"}` → sentences with tokens
(`text, lemma, pos, morph, ws, isWord`) in the shape of `StoryToken` from `@lm/schema`.
