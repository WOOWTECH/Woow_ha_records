"""Guard the READMEs' tables of contents against dead anchors.

A link to ``#heading`` that no heading generates is invisible to everything
but a reader clicking it: the file renders fine, CI has nothing to say, and
the link silently scrolls nowhere. Issue #38 found four such links in
``README_zh-TW.md`` that had pointed at never-written API-reference sections
for at least one release — #24 even renamed the words inside them without
anyone noticing they resolved to nothing.

The rule this file encodes: every intra-document anchor link in a README
names a heading that document actually contains.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent


def _github_anchor(heading: str) -> str:
    """The anchor GitHub generates for one markdown heading line.

    Lowercase, punctuation stripped, spaces hyphenated. ``\\w`` already
    matches CJK, so the zh-Hant headings need nothing special.
    """
    text = heading.lstrip("#").strip().lower()
    text = re.sub(r"[^\w\s-]", "", text)
    return re.sub(r"\s+", "-", text)


def _heading_anchors(text: str) -> set[str]:
    """Every anchor the document's headings generate.

    Fenced code blocks are skipped — a ``#`` comment in a shell example is
    not a heading, and counting it as one could quietly vouch for a dead
    link. Repeated headings get GitHub's ``-1``, ``-2`` suffixes.
    """
    anchors: set[str] = set()
    seen: dict[str, int] = {}
    in_fence = False
    for line in text.splitlines():
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence or not re.match(r"#{1,6}\s", line):
            continue
        anchor = _github_anchor(line)
        n = seen.get(anchor, 0)
        seen[anchor] = n + 1
        anchors.add(anchor if n == 0 else f"{anchor}-{n}")
    return anchors


def _anchor_links(text: str) -> list[str]:
    """Every intra-document anchor link, in either syntax the READMEs use."""
    return re.findall(r'href="#([^"]+)"', text) + re.findall(
        r"\]\(#([^)]+)\)", text
    )


class TestReadmeAnchors:
    """Every ``#`` link in a README lands on a heading in the same file."""

    @pytest.mark.parametrize("name", ["README.md", "README_zh-TW.md"])
    def test_every_anchor_link_resolves(self, name: str) -> None:
        text = (ROOT / name).read_text(encoding="utf-8")
        anchors = _heading_anchors(text)

        dead = [
            f"#{link}"
            for link in _anchor_links(text)
            if link.lower() not in anchors
        ]
        assert not dead, (
            f"{name} links to {len(dead)} anchor(s) no heading in the file "
            f"generates: {dead}"
        )
