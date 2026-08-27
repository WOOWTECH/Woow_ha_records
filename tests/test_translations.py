"""Guard the integration's UI strings against drift.

Home Assistant reads UI strings from ``translations/<lang>.json`` and never
from ``strings.json``. ``strings.json`` is only the source of truth authors
edit; anything that does not reach a translation file never reaches the
frontend. Two files that must stay in sync with nothing watching them is how
issue #4 happened — 113 finance keys sat in ``strings.json`` for a whole
release without ever being copied across.

The rule this file encodes, which is both Home Assistant's convention and this
repo's:

    ``translations/en.json`` is a verbatim copy of ``strings.json``.

It is never maintained by hand as a separate file. Every other language is a
real translation, so it shares only the key structure, not the values.
"""
from __future__ import annotations

import ast
import json
from pathlib import Path

import pytest
import yaml

COMPONENT = Path(__file__).parent.parent / "custom_components" / "woow_ha_records"
STRINGS = COMPONENT / "strings.json"
TRANSLATIONS = COMPONENT / "translations"
SERVICES_YAML = COMPONENT / "services.yaml"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _key_paths(node: object, prefix: str = "") -> set[str]:
    """Flatten a nested dict into the set of its dotted leaf paths."""
    if not isinstance(node, dict):
        return {prefix}
    return {
        path
        for key, value in node.items()
        for path in _key_paths(value, f"{prefix}.{key}")
    }


class TestTranslations:
    """Every language file stays in lockstep with strings.json."""

    @pytest.mark.parametrize("language", ["en", "zh-Hant"])
    def test_translation_has_every_strings_key(self, language: str) -> None:
        """Each translation file carries exactly the keys strings.json defines.

        This is the regression guard for issue #4. Repairing the 113 keys that
        were missing does nothing to stop the 114th from drifting; this does.
        """
        expected = _key_paths(_load_json(STRINGS))
        actual = _key_paths(_load_json(TRANSLATIONS / f"{language}.json"))

        missing = sorted(expected - actual)
        extra = sorted(actual - expected)

        assert not missing, (
            f"translations/{language}.json is missing {len(missing)} key(s) "
            f"that strings.json defines: {missing}"
        )
        assert not extra, (
            f"translations/{language}.json defines {len(extra)} key(s) that "
            f"strings.json does not: {extra}"
        )

    def test_en_translation_is_a_verbatim_copy_of_strings(self) -> None:
        """en.json is strings.json, byte for byte — not a hand-maintained file.

        Key parity alone would not have caught issue #4's root cause: before
        the merge, ha_finance's en.json had drifted in *values* too. Comparing
        the text keeps the two files genuinely interchangeable.
        """
        source = STRINGS.read_text(encoding="utf-8")
        english = (TRANSLATIONS / "en.json").read_text(encoding="utf-8")

        assert english == source, (
            "translations/en.json has diverged from strings.json. It is a "
            "verbatim copy, never edited by hand: copy strings.json over it."
        )

    def test_every_service_has_ui_strings(self) -> None:
        """Every service in services.yaml is described in strings.json."""
        declared = set(yaml.safe_load(SERVICES_YAML.read_text(encoding="utf-8")))
        described = set(_load_json(STRINGS).get("services", {}))

        undescribed = sorted(declared - described)
        assert not undescribed, (
            f"{len(undescribed)} service(s) in services.yaml have no entry in "
            f"strings.json.services: {undescribed}"
        )

    def test_every_service_field_has_ui_strings(self) -> None:
        """Every field a service accepts is described alongside it.

        A service entry that names itself but not its fields still leaves the
        service-call dialog falling back to ``services.yaml``, which is the
        same defect #13 fixed, one level down.
        """
        schemas = yaml.safe_load(SERVICES_YAML.read_text(encoding="utf-8"))
        described = _load_json(STRINGS).get("services", {})

        undescribed = sorted(
            f"{service}.{field}"
            for service, schema in schemas.items()
            if service in described
            for field in (schema or {}).get("fields") or {}
            if field not in (described[service].get("fields") or {})
        )
        assert not undescribed, (
            f"{len(undescribed)} service field(s) in services.yaml have no "
            f"entry in strings.json.services: {undescribed}"
        )

    def test_every_raised_exception_has_a_message(self) -> None:
        """Every ``translation_key`` raised under areas/ has a message.

        Exceptions have no fallback: ``async_get_exception_message`` returns
        the translation key itself when the lookup misses, so a missing entry
        shows the user the literal string ``asset_not_found``. This is the
        regression guard for issue #13, where 15 such keys had accumulated
        across three Areas with nothing watching them.
        """
        declared = set(_load_json(STRINGS).get("exceptions", {}))
        raised = {
            keyword.value.value
            for path in (COMPONENT / "areas").rglob("*.py")
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8")))
            if isinstance(node, ast.Raise) and isinstance(node.exc, ast.Call)
            for keyword in node.exc.keywords
            if keyword.arg == "translation_key"
            and isinstance(keyword.value, ast.Constant)
        }

        undescribed = sorted(raised - declared)
        assert not undescribed, (
            f"{len(undescribed)} exception(s) raised under areas/ have no "
            f"entry in strings.json.exceptions: {undescribed}"
        )
