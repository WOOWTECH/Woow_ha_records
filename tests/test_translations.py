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
import re
from functools import cache
from pathlib import Path
from typing import NamedTuple

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


class _RaiseSite(NamedTuple):
    """One ``raise ...(translation_key=...)`` found under ``areas/``."""

    path: Path
    lineno: int
    key: str
    supplied: frozenset[str] | None
    """Placeholder names the site passes, or None if it passes a dict this
    file cannot read statically (a variable, a call, a ``**`` unpacking)."""


@cache
def _raise_sites() -> tuple[_RaiseSite, ...]:
    """Every translated exception raised under ``areas/``, read statically.

    Reading the source with ``ast`` rather than importing it keeps the guard
    independent of Home Assistant: a raise site is a fact about the file, and
    every one of them must be reachable without standing up a ``hass``.
    """
    sites = []
    for path in sorted((COMPONENT / "areas").rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not (isinstance(node, ast.Raise) and isinstance(node.exc, ast.Call)):
                continue
            keywords = {k.arg: k.value for k in node.exc.keywords if k.arg}
            key = keywords.get("translation_key")
            if not isinstance(key, ast.Constant):
                continue
            placeholders = keywords.get("translation_placeholders")
            if placeholders is None:
                supplied = frozenset()
            elif isinstance(placeholders, ast.Dict) and all(
                isinstance(name, ast.Constant) for name in placeholders.keys
            ):
                supplied = frozenset(name.value for name in placeholders.keys)
            else:
                supplied = None
            sites.append(_RaiseSite(path, node.lineno, key.value, supplied))
    return tuple(sites)


@cache
def _exception_messages() -> dict[str, str]:
    """Every exception message in strings.json, by the key a raise site uses.

    ``exceptions`` is nested one level per Area, so that key is
    ``<area>.<name>``. The dot is not special to Home Assistant: it flattens
    the whole ``exceptions`` subtree with ``recursive_flatten`` before
    ``async_get_exception_message`` looks the message up, so any depth
    resolves. The dot is only special to us, as the Area boundary.
    """
    exceptions = _load_json(STRINGS).get("exceptions", {})
    return {
        f"{area}.{name}": entry.get("message", "")
        for area, keys in exceptions.items()
        for name, entry in keys.items()
    }


def _placeholders_in(message: str) -> set[str]:
    """Return the placeholder names a strings.json message interpolates.

    Deliberately matches any identifier, not just lowercase words: a guard
    that silently skipped ``{value2}`` would report parity it never checked.
    """
    return set(re.findall(r"\{(\w+)\}", message))


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
        shows the user the literal string ``asset.asset_not_found``. This is the
        regression guard for issue #13, where 15 such keys had accumulated
        across three Areas with nothing watching them.
        """
        declared = set(_exception_messages())
        raised = {site.key for site in _raise_sites()}

        undescribed = sorted(raised - declared)
        assert not undescribed, (
            f"{len(undescribed)} exception(s) raised under areas/ have no "
            f"entry in strings.json.exceptions: {undescribed}"
        )

    def test_every_raised_exception_supplies_its_placeholders(self) -> None:
        """Every raise site fills in every placeholder its message names.

        Home Assistant formats the message inside a ``suppress(KeyError)``, so
        one missing placeholder discards the whole ``.format()`` call and the
        user is shown the raw template — braces, every other placeholder, and
        all. Not one missing word: the whole message. This is the regression
        guard for issue #27, where ``invalid_datetime`` was authored for the
        health Area's parser, which knows the field name, and then reused from
        the asset Area's parser, which did not.

        This is #13's guard one level down: that one proves the message
        exists, this proves it can be filled in. Extra placeholders are legal
        and deliberately not flagged — ``str.format`` ignores them.
        """
        messages = _exception_messages()

        opaque = [
            f"{site.path.relative_to(COMPONENT)}:{site.lineno} ({site.key})"
            for site in _raise_sites()
            if site.supplied is None
        ]
        assert not opaque, (
            f"{len(opaque)} raise site(s) pass translation_placeholders this "
            f"guard cannot read. Spell the dict out inline so a missing "
            f"placeholder stays visible here: {opaque}"
        )

        underfilled = sorted(
            f"{site.path.relative_to(COMPONENT)}:{site.lineno} ({site.key}) "
            f"missing {sorted(missing)}"
            for site in _raise_sites()
            if site.supplied is not None
            and (
                missing := _placeholders_in(messages.get(site.key, ""))
                - site.supplied
            )
        )
        assert not underfilled, (
            f"{len(underfilled)} raise site(s) under areas/ do not supply "
            f"every placeholder their strings.json message names, so the "
            f"whole message renders raw: {underfilled}"
        )

    def test_every_exception_key_names_its_own_area(self) -> None:
        """An Area raises only exception keys from its own namespace.

        ``exceptions`` used to be one flat namespace that all four Areas
        raised into, which is how issue #27 happened: ``invalid_datetime``
        was authored for the health Area, whose parser takes the field name
        as a parameter, and then reused by the asset Area's parser, which had
        no such parameter. The message lost a placeholder it needed and
        rendered raw. Nothing stopped it.

        The namespace is now nested one level per Area, so the accident is
        no longer something an author can reach for by habit — reusing
        another Area's wording means typing that Area's name. This test is
        what turns that from a convention into a rule. It is the same
        boundary CLAUDE.md draws everywhere else: the Areas share a runtime
        and nothing else.

        This is deliberately stricter than #27's placeholder guard. That one
        catches a *symptom* of cross-Area reuse — a key whose placeholders do
        not match the site. It says nothing about a key whose placeholders
        happen to line up but whose wording belongs to another Area.
        """
        misplaced = sorted(
            f"{site.path.relative_to(COMPONENT)}:{site.lineno} raises "
            f"{site.key!r} from the {site.path.parent.name} Area"
            for site in _raise_sites()
            if site.key.split(".")[0] != site.path.parent.name
        )
        assert not misplaced, (
            f"{len(misplaced)} raise site(s) name an exception key outside "
            f"their own Area. Every key is <area>.<name>, and an Area raises "
            f"only its own — copy the message into this Area's namespace "
            f"rather than borrowing another's: {misplaced}"
        )
