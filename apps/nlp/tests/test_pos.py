from app.pos import PART_OF_SPEECH, map_pos


def test_known_tags_map_into_enum():
    for upos in ["NOUN", "PROPN", "VERB", "AUX", "ADJ", "ADV", "PRON", "DET", "ADP", "CCONJ", "SCONJ", "NUM", "INTJ", "PUNCT"]:
        assert map_pos(upos) in PART_OF_SPEECH


def test_unknown_tag_is_other():
    assert map_pos("WAT") == "other"
