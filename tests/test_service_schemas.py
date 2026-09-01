"""Every service validates its call before the handler runs.

Registration used to pass no ``schema=``, so Home Assistant handed
``call.data`` to the handler untouched: an unknown field was dropped and the
call still reported success, and a missing required field surfaced as the
``KeyError`` the handler raised indexing ``call.data``. Issue #44.

These tests read the registration table rather than a list of service names,
so a service added later is covered the day it is added.

The whole surface is checked against ``services.yaml``, which is the
published contract for what a caller may send. The two drifting apart is how
the missing-schema bug stayed invisible: ``services.yaml`` said ``required:
true`` and nothing enforced it.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import voluptuous as vol
import yaml
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from custom_components.woow_ha_records.const import DOMAIN, service_name
from custom_components.woow_ha_records.services import (
    _AREA_SERVICES,
    async_register_services,
)

INTEGRATION = Path(__file__).parent.parent / "custom_components" / "woow_ha_records"
DOCUMENTED: dict[str, Any] = yaml.safe_load(
    (INTEGRATION / "services.yaml").read_text(encoding="utf-8")
)

# Read from the registration table itself, not a list of names kept alongside
# it, so a verb — or a fifth Area — is covered the day it is added.
#
# Every registered service, as ``(full_service_name, schema)``. Parametrising
# on this means a failure names the one service that broke.
REGISTERED = [
    (service_name(area, verb), schema)
    for area, handlers in _AREA_SERVICES.items()
    for verb, (_handler, _response, schema) in handlers.items()
]

# Accepted by every validator these schemas use — ``cv.string``,
# ``vol.Coerce(float)``, ``_valid_float``, ``cv.boolean`` and
# ``vol.Any(cv.string, None)`` all take it — so a required payload can be
# built without knowing field types.
SAMPLE = "1"


def _documented_fields(service: str) -> dict[str, bool]:
    """Return ``{field: is_required}`` as ``services.yaml`` documents it."""
    fields = DOCUMENTED[service].get("fields") or {}
    return {
        name: bool((spec or {}).get("required", False))
        for name, spec in fields.items()
    }


def _schema_fields(schema: vol.Schema) -> dict[str, bool]:
    """Return ``{field: is_required}`` as the schema enforces it."""
    return {
        str(marker): isinstance(marker, vol.Required) for marker in schema.schema
    }


def _required_payload(schema: vol.Schema) -> dict[str, str]:
    """Return the smallest call this schema accepts."""
    return {
        str(marker): SAMPLE
        for marker in schema.schema
        if isinstance(marker, vol.Required)
    }


class _RecordingServices:
    """Collects what ``async_register_services`` asks Home Assistant for."""

    def __init__(self) -> None:
        self.registered: dict[str, dict[str, Any]] = {}

    def async_register(
        self, domain: str, service: str, handler: Any, **kwargs: Any
    ) -> None:
        self.registered[f"{domain}.{service}"] = kwargs


def test_the_registered_set_is_exactly_what_services_yaml_documents() -> None:
    """45 services — finance 14, asset 10, health 12, note 9."""
    names = {name for name, _ in REGISTERED}

    assert names == set(DOCUMENTED)
    assert {area: len(h) for area, h in _AREA_SERVICES.items()} == {
        "finance": 14,
        "asset": 10,
        "health": 12,
        "note": 9,
    }


def test_registration_hands_every_schema_to_home_assistant() -> None:
    """A schema the registration helper drops on the floor validates nothing."""
    hass = type("_Hass", (), {"services": _RecordingServices()})()

    async_register_services(hass)

    passed = hass.services.registered
    assert set(passed) == {f"{DOMAIN}.{name}" for name, _ in REGISTERED}
    for name, schema in REGISTERED:
        assert passed[f"{DOMAIN}.{name}"]["schema"] is schema


@pytest.mark.parametrize(("service", "schema"), REGISTERED, ids=lambda v: v)
def test_every_service_carries_a_schema(service: str, schema: Any) -> None:
    """A handler with no schema is a handler nothing validates."""
    assert isinstance(schema, vol.Schema), service


@pytest.mark.parametrize(("service", "schema"), REGISTERED, ids=lambda v: v)
def test_fields_match_services_yaml(service: str, schema: vol.Schema) -> None:
    """The schema accepts exactly the fields the published contract documents.

    Both directions matter. A field in ``services.yaml`` but not the schema
    is rejected despite being documented; a field in the schema but not
    ``services.yaml`` is undocumented and unreachable from the UI picker.
    """
    assert _schema_fields(schema) == _documented_fields(service)


@pytest.mark.parametrize(("service", "schema"), REGISTERED, ids=lambda v: v)
def test_no_optional_field_carries_a_default(
    service: str, schema: vol.Schema
) -> None:
    """An omitted optional field stays omitted.

    This is the change's one genuinely dangerous failure mode. Handlers read
    absence as "leave unchanged" — ``"note" in call.data``,
    ``call.data.get("value")``. A ``default=`` would make voluptuous fill the
    key in before the handler ever looks, turning every omitted field on
    ``update_note``, ``update_asset``, ``update_plan`` and the rest into an
    explicit overwrite that silently clears data the caller never mentioned.
    """
    for marker in schema.schema:
        if isinstance(marker, vol.Optional):
            assert marker.default is vol.UNDEFINED, f"{service}.{marker}"


@pytest.mark.parametrize(("service", "schema"), REGISTERED, ids=lambda v: v)
def test_a_call_of_only_required_fields_gains_no_keys(
    service: str, schema: vol.Schema
) -> None:
    """Passing just the required fields validates, and adds nothing.

    Values may change — the numeric fields coerce ``"1"`` to ``1.0`` — but
    the set of keys the handler sees has to be the set the caller sent, or
    ``"field" in call.data`` stops meaning what the handlers assume.
    """
    payload = _required_payload(schema)

    assert set(schema(payload)) == set(payload)


@pytest.mark.parametrize(("service", "schema"), REGISTERED, ids=lambda v: v)
def test_an_unknown_field_is_an_error(service: str, schema: vol.Schema) -> None:
    """The original defect: an unknown field vanished and the call succeeded."""
    payload = _required_payload(schema) | {"category_id_typo": "x"}

    with pytest.raises(vol.Invalid) as caught:
        schema(payload)

    assert "extra keys not allowed" in str(caught.value)


@pytest.mark.parametrize(("service", "schema"), REGISTERED, ids=lambda v: v)
def test_a_missing_required_field_names_itself(
    service: str, schema: vol.Schema
) -> None:
    """Omitting a required field is a validation error, not a ``KeyError``.

    The caller has to be told *which* field, or the error is no better than
    the traceback it replaces.
    """
    required = _required_payload(schema)
    for omitted in required:
        payload = {k: v for k, v in required.items() if k != omitted}

        with pytest.raises(vol.Invalid) as caught:
            schema(payload)

        assert omitted in str(caught.value)


class TestThroughTheRealServiceRegistry:
    """The same two failures, driven through ``hass.services.async_call``.

    The schema tests above check the schemas; this checks that Home Assistant
    actually applies them. Both calls are rejected before the handler runs,
    so neither needs the integration's runtime data to be set up.

    Issue #44 was found on ``note_update_note`` with a ``category_id`` it did
    not accept: the field was dropped, the call reported success, and that is
    how #26 came to be mistaken for a missing feature. #43 has since made
    ``category_id`` a real field on this service, so the stray field here is a
    misspelling of it — the same shape of mistake, and the one a caller who
    has read about the move is now most likely to make.
    """

    async def test_an_unknown_field_is_rejected(self, hass: HomeAssistant) -> None:
        """The unknown field is named, rather than silently dropped."""
        async_register_services(hass)

        with pytest.raises(vol.Invalid) as caught:
            await hass.services.async_call(
                DOMAIN,
                "note_update_note",
                {"note_id": "abc", "categroy_id": "def"},
                blocking=True,
            )

        assert "categroy_id" in str(caught.value)

    async def test_the_move_field_is_accepted(self, hass: HomeAssistant) -> None:
        """``category_id`` reaches the handler rather than being rejected.

        The guard on the test above: a schema that rejected every unrecognised
        field would pass it whether or not the move field was recognised. This
        call gets past validation and fails in the handler instead, on runtime
        data no test here sets up.
        """
        async_register_services(hass)

        with pytest.raises(HomeAssistantError) as caught:
            await hass.services.async_call(
                DOMAIN,
                "note_update_note",
                {"note_id": "abc", "category_id": "def"},
                blocking=True,
            )

        assert not isinstance(caught.value, vol.Invalid)

    async def test_a_missing_required_field_is_rejected(
        self, hass: HomeAssistant
    ) -> None:
        """The omitted field is named, rather than surfacing as a ``KeyError``."""
        async_register_services(hass)

        with pytest.raises(vol.Invalid) as caught:
            await hass.services.async_call(
                DOMAIN, "note_update_note", {"title": "Renamed"}, blocking=True
            )

        assert "note_id" in str(caught.value)
