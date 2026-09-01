"""Deleting a Note takes its entities out of the registry with it.

Issue #65. Both delete paths composed the entity ``unique_id`` by hand, and
composed it wrong -- ``f"{DOMAIN}_{category_id}_{note_id}{suffix}"`` against a
registration of ``unique_id(AREA, category_id, note_id, suffix)``, so
``woow_ha_records_...`` was looked up where ``note_...`` was stored. The lookup
returned ``None`` at all four sites and the removal was never reached, leaving
two orphaned entries behind every deleted Note.

Nothing caught it because no test asserted on the registry after a delete: the
#45 tests check the store and the ``force`` guard, which both behaved. These
tests are the assertion that was missing, and they read the entity classes'
own ``note_unique_id`` rather than restating the shape -- restating it is the
whole defect.
"""
from __future__ import annotations

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component

from custom_components.woow_ha_records.areas.note.entity import (
    NOTE_ENTITIES,
    note_unique_id,
)
from custom_components.woow_ha_records.areas.note.store import (
    HaNoteRecordStore,
    Note,
)
from custom_components.woow_ha_records.const import DOMAIN
from custom_components.woow_ha_records.runtime import WoowRecordsData
from custom_components.woow_ha_records.services import async_register_services
from custom_components.woow_ha_records.websocket import (
    async_register_websocket_commands,
)

DELETE_NOTE_SERVICE = "note_delete_note"
DELETE_CATEGORY_SERVICE = "note_delete_category"
DELETE_NOTE_WS = "woow_ha_records/note/delete_note"
DELETE_CATEGORY_WS = "woow_ha_records/note/delete_category"


def _runtime(hass: HomeAssistant, store: HaNoteRecordStore) -> None:
    """Put *store* where the handlers look for it."""
    hass.data[DOMAIN] = WoowRecordsData(
        finance=None,  # type: ignore[arg-type]
        asset=None,  # type: ignore[arg-type]
        health=None,  # type: ignore[arg-type]
        note=store,
    )


@pytest.fixture
def note_services(hass: HomeAssistant, store: HaNoteRecordStore) -> HaNoteRecordStore:
    """Register the note services against a reachable store."""
    _runtime(hass, store)
    async_register_services(hass)
    return store


@pytest.fixture
async def ws_client(hass: HomeAssistant, store: HaNoteRecordStore, hass_ws_client):
    """A connected client with the note commands registered."""
    assert await async_setup_component(hass, "websocket_api", {})
    _runtime(hass, store)
    async_register_websocket_commands(hass)
    return await hass_ws_client(hass)


async def _note_with_entities(
    hass: HomeAssistant, store: HaNoteRecordStore, title: str = "Shopping list"
) -> tuple[str, Note]:
    """A Note in a Category, with both its entities in the registry.

    Stands in for the platforms, which register exactly these two on setup.
    """
    category = await store.async_create_category("Work")
    note = await store.async_create_note(category_id=category.id, title=title)
    assert note is not None

    ent_reg = er.async_get(hass)
    for platform, suffix in NOTE_ENTITIES:
        ent_reg.async_get_or_create(
            platform, DOMAIN, note_unique_id(note.id, suffix)
        )
    return category.id, note


def _registered(hass: HomeAssistant, note: Note) -> list[str]:
    """The entity_ids still registered for *note*."""
    ent_reg = er.async_get(hass)
    return [
        entity_id
        for platform, suffix in NOTE_ENTITIES
        if (
            entity_id := ent_reg.async_get_entity_id(
                platform, DOMAIN, note_unique_id(note.id, suffix)
            )
        )
        is not None
    ]


class TestDeleteNoteCleanup:
    """A deleted Note leaves nothing registered."""

    async def test_the_fixture_registers_what_the_platforms_would(
        self, hass: HomeAssistant, store: HaNoteRecordStore
    ) -> None:
        """Guard: the assertions below are worthless if nothing was registered."""
        _, note = await _note_with_entities(hass, store)

        assert len(_registered(hass, note)) == len(NOTE_ENTITIES)

    async def test_service_removes_both_entities(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """``note_delete_note`` clears the registry, not just the store."""
        _, note = await _note_with_entities(hass, note_services)

        await hass.services.async_call(
            DOMAIN, DELETE_NOTE_SERVICE, {"note_id": note.id}, blocking=True
        )

        assert _registered(hass, note) == []

    async def test_websocket_removes_both_entities(
        self, hass: HomeAssistant, ws_client, store: HaNoteRecordStore
    ) -> None:
        """The WebSocket surface clears the registry too."""
        _, note = await _note_with_entities(hass, store)

        await ws_client.send_json(
            {"id": 1, "type": DELETE_NOTE_WS, "note_id": note.id}
        )
        assert (await ws_client.receive_json())["success"]

        assert _registered(hass, note) == []


class TestDeleteCategoryCleanup:
    """The cascade clears the registry for every Note it destroys."""

    async def test_service_cascade_removes_every_note_entity(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """Nothing of a cascaded Note is left registered."""
        category_id, first = await _note_with_entities(
            hass, note_services, "Shopping list"
        )
        second = await note_services.async_create_note(
            category_id=category_id, title="Reading list"
        )
        assert second is not None
        ent_reg = er.async_get(hass)
        for platform, suffix in NOTE_ENTITIES:
            ent_reg.async_get_or_create(
                platform, DOMAIN, note_unique_id(second.id, suffix)
            )

        await hass.services.async_call(
            DOMAIN,
            DELETE_CATEGORY_SERVICE,
            {"category_id": category_id, "force": True},
            blocking=True,
        )

        assert _registered(hass, first) == []
        assert _registered(hass, second) == []

    async def test_websocket_cascade_removes_every_note_entity(
        self, hass: HomeAssistant, ws_client, store: HaNoteRecordStore
    ) -> None:
        """Both surfaces cascade the same way."""
        category_id, note = await _note_with_entities(hass, store)

        await ws_client.send_json(
            {
                "id": 1,
                "type": DELETE_CATEGORY_WS,
                "category_id": category_id,
                "force": True,
            }
        )
        assert (await ws_client.receive_json())["success"]

        assert _registered(hass, note) == []

    async def test_a_refused_cascade_removes_nothing(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """Without ``force`` the registry is left exactly as it was (#45)."""
        category_id, note = await _note_with_entities(hass, note_services)

        with pytest.raises(ServiceValidationError):
            await hass.services.async_call(
                DOMAIN,
                DELETE_CATEGORY_SERVICE,
                {"category_id": category_id},
                blocking=True,
            )

        assert len(_registered(hass, note)) == len(NOTE_ENTITIES)
