"""FastAPI + spaCy annotation service.

POST /annotate {text, language} -> sentences with tokens shaped like StoryToken in
packages/schema/src/story.ts: text, lemma, pos, morph, ws (following whitespace), isWord.
Deterministic and free: the LLM never produces token-level JSON.
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .pos import map_pos

MODELS = {"es": os.environ.get("SPACY_MODEL", "es_core_news_md")}

app = FastAPI(title="Language Master NLP", version="0.1.0")


class AnnotateRequest(BaseModel):
    """Either `text` (one block) or `paragraphs` (several blocks, annotated separately)."""

    text: str | None = Field(default=None, min_length=1, max_length=20_000)
    paragraphs: list[str] | None = Field(default=None, max_length=200)
    language: Literal["es"] = "es"


class Token(BaseModel):
    text: str
    lemma: str
    pos: str
    morph: dict[str, str]
    ws: str
    isWord: bool


class Sentence(BaseModel):
    id: str
    text: str
    tokens: list[Token]


class Paragraph(BaseModel):
    sentences: list[Sentence]


class AnnotateResponse(BaseModel):
    language: str
    model: str
    sentences: list[Sentence]
    paragraphs: list[Paragraph]


@lru_cache(maxsize=4)
def load(language: str):
    import spacy  # imported lazily so /health works without the model

    name = MODELS.get(language)
    if not name:
        raise HTTPException(400, f"unsupported language {language}")
    try:
        return spacy.load(name, disable=["ner"])
    except OSError as e:  # model not installed
        raise HTTPException(503, f"model {name} not available: {e}") from e


def annotate(nlp, text: str) -> list[Sentence]:
    doc = nlp(text)
    out: list[Sentence] = []
    for i, sent in enumerate(doc.sents, start=1):
        tokens = [
            Token(
                text=t.text,
                lemma=(t.lemma_ or t.text).lower() if t.pos_ != "PROPN" else t.text,
                pos=map_pos(t.pos_),
                morph=dict(kv.split("=", 1) for kv in str(t.morph).split("|") if "=" in kv),
                ws=t.whitespace_,
                isWord=not (t.is_punct or t.is_space),
            )
            for t in sent
            if not t.is_space
        ]
        if tokens:
            out.append(Sentence(id=f"s{i}", text=sent.text.strip(), tokens=tokens))
    return out


@app.get("/health")
def health():
    return {"ok": True, "models": MODELS}


@app.post("/annotate", response_model=AnnotateResponse)
def annotate_endpoint(req: AnnotateRequest):
    nlp = load(req.language)
    blocks = req.paragraphs if req.paragraphs is not None else [req.text or ""]
    if not any(b.strip() for b in blocks):
        raise HTTPException(422, "text or paragraphs required")
    paragraphs = [Paragraph(sentences=annotate(nlp, b)) for b in blocks if b.strip()]
    flat = [s for p in paragraphs for s in p.sentences]
    return AnnotateResponse(language=req.language, model=MODELS[req.language], sentences=flat, paragraphs=paragraphs)
