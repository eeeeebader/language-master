"""Map spaCy universal POS tags onto the plan's PartOfSpeech enum (packages/schema/src/common.ts)."""

PART_OF_SPEECH = (
    "noun", "verb", "adj", "adv", "pron", "det", "prep", "conj", "num", "intj", "phrase", "other",
)

_UPOS = {
    "NOUN": "noun",
    "PROPN": "noun",
    "VERB": "verb",
    "AUX": "verb",
    "ADJ": "adj",
    "ADV": "adv",
    "PRON": "pron",
    "DET": "det",
    "ADP": "prep",
    "CCONJ": "conj",
    "SCONJ": "conj",
    "NUM": "num",
    "INTJ": "intj",
    "PUNCT": "other",
    "SYM": "other",
    "X": "other",
    "PART": "other",
    "SPACE": "other",
}


def map_pos(upos: str) -> str:
    return _UPOS.get(upos, "other")
