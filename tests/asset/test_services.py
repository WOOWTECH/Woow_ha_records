"""Tests for the asset Area's service handlers."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from homeassistant.exceptions import ServiceValidationError

from custom_components.woow_ha_records.areas.asset.services import _parse_datetime

STRINGS = (
    Path(__file__).parent.parent.parent
    / "custom_components"
    / "woow_ha_records"
    / "strings.json"
)


class TestParseDatetime:
    """``_parse_datetime`` parses, normalises, and reports by field name."""

    def test_returns_none_for_an_absent_value(self) -> None:
        """An omitted optional datetime is not an error."""
        assert _parse_datetime(None, "purchase_at") is None
        assert _parse_datetime("", "purchase_at") is None

    def test_assumes_utc_for_a_naive_datetime(self) -> None:
        """Naive input is read as UTC, never as local time."""
        parsed = _parse_datetime("2026-08-27T09:30:00", "purchase_at")

        assert parsed is not None
        assert parsed.tzinfo is not None
        assert parsed.utcoffset().total_seconds() == 0

    def test_names_the_field_that_failed(self) -> None:
        """The error says which field held the unparseable value.

        Both placeholders matter to the user: ``value`` alone leaves them
        guessing which of ``purchase_at`` and ``warranty_until`` they got
        wrong, and — because Home Assistant drops the whole ``.format()``
        call when one placeholder is missing — omitting ``field`` would show
        them the raw template instead of a message. Issue #27.
        """
        with pytest.raises(ServiceValidationError) as caught:
            _parse_datetime("not-a-date", "warranty_until")

        assert caught.value.translation_key == "asset.invalid_datetime"
        assert caught.value.translation_placeholders == {
            "field": "warranty_until",
            "value": "not-a-date",
        }

    def test_renders_a_message_with_nothing_left_unfilled(self) -> None:
        """The placeholders raised actually fill in the published message."""
        exceptions = json.loads(STRINGS.read_text(encoding="utf-8"))["exceptions"]
        message = exceptions["asset"]["invalid_datetime"]["message"]

        with pytest.raises(ServiceValidationError) as caught:
            _parse_datetime("not-a-date", "purchase_at")

        rendered = message.format(**caught.value.translation_placeholders)
        assert "{" not in rendered
        assert "purchase_at" in rendered
