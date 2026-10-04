"""Minimal wikitext cleaning: just enough to read names out of a bullet list."""

from __future__ import annotations

import re

_REF = re.compile(r"<ref\b[^>]*/>|<ref\b[^>]*>.*?</ref>", re.S | re.I)
_TEMPLATE = re.compile(r"\{\{[^{}]*\}\}")
_LINK = re.compile(r"\[\[(?:[^\]|]*\|)?([^\]]+)\]\]")
_TAG = re.compile(r"<[^>]+>")


def clean_wikitext(text: str) -> str:
    """Drop refs, templates, html tags, bold/italic marks; keep the display text of links."""
    text = _REF.sub("", text)
    for _ in range(3):  # templates can be nested
        text = _TEMPLATE.sub("", text)
    text = _LINK.sub(r"\1", text)
    text = text.replace("'''", "").replace("''", "")
    text = _TAG.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()
