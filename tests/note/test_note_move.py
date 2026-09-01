"""A Note moves between Categories, on both surfaces.

Issue #43. A Note's Category used to be fixed at creation, and the obstacle was
never a missing field: the Category sat inside the entity ``unique_id``, it was
the device the entities attached to, and its name was slugified into the
``entity_id``. A move was an identity change.

ADR-0003 settled that the Category is an attribute of a Note, the same as it is
of an Asset. What is left for a move to do is a store write and one re-point of
the entity registry, and this file holds both to that: the Note keeps
everything but its Category and ``updated_at``, its entities end up under the
destination Category's device and nowhere else, and a destination that does not
exist changes nothing at all.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.woow_ha_records.areas.note.entity import (
    NOTE_ENTITIES,
    note_unique_id,
)
from custom_components.woow_ha_records.areas.note.store import (
    Category,
    HaNoteRecordStore,
    Note,
)
from custom_components.woow_ha_records.const import DOMAIN, device_id
from custom_components.woow_ha_records.runtime import WoowRecordsData
from custom_components.woow_ha_records.services import async_register_services
from custom_components.woow_ha_records.websocket import (
    async_register_websocket_commands,
)

AREA = "note"
UPDATE_NOTE_SERVICE = "note_update_note"
UPDATE_NOTE_WS = "woow_ha_records/note/update_note"


def _runtime(hass: HomeAssistant, store: HaNoteRecordStore) -> None:
    """Put *store* where the handlers look for it.

    Handlers receive only a ``ServiceCall`` or a ``hass``, so they read the
    runtime record out of ``hass.data``. Only the note Area is exercised here.
    """
    hass.data[DOMAIN] = WoowRecordsData(
        finance=None,  # type: ignore[arg-type]
        asset=None,  # type: ignore[arg-type]
        health=None,  # type: ignore[arg-type]
        note=store,
    )


@pytest.fixture
def store(hass: HomeAssistant) -> HaNoteRecordStore:
    """A note store whose config entry is really in ``hass``.

    Overrides the Area fixture, which builds an entry it never adds. The device
    registry refuses to link a device to a config entry it cannot find, and a
    move creates the destination Category's device, so the entry has to be real
    here.
    """
    entry = MockConfigEntry(domain=DOMAIN, title="Woow HA Records", unique_id=DOMAIN)
    entry.add_to_hass(hass)
    note_store = HaNoteRecordStore(hass, entry)
    note_store._store = AsyncMock()
    note_store._store.async_load = AsyncMock(return_value=None)
    note_store._store.async_save = AsyncMock()
    return note_store


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


async def _two_categories(
    store: HaNoteRecordStore,
) -> tuple[Category, Category, Note]:
    """A Note in ``Work``, and an empty ``Personal`` to move it into."""
    source = await store.async_create_category("Work")
    destination = await store.async_create_category("Personal")
    note = await store.async_create_note(
        category_id=source.id,
        title="Shopping list",
        content="milk, eggs",
        pinned=True,
    )
    assert note is not None
    return source, destination, note


def _register_note_entities(
    hass: HomeAssistant, entry: ConfigEntry, category: Category, note: Note
) -> dict[str, str]:
    """Register a Note's two entities under *category*'s device.

    Stands in for the platforms, which compose exactly this on setup. Returns
    the entity_ids by platform so a test can look up where they ended.
    """
    dev_reg = dr.async_get(hass)
    device = dev_reg.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, device_id(AREA, category.id))},
        name=category.name,
    )
    ent_reg = er.async_get(hass)
    return {
        platform: ent_reg.async_get_or_create(
            platform,
            DOMAIN,
            note_unique_id(note.id, suffix),
            device_id=device.id,
            config_entry=entry,
        ).entity_id
        for platform, suffix in NOTE_ENTITIES
    }


class TestStoreMove:
    """The store half: a move is an ordinary field write."""

    async def test_moves_the_note(self, store: HaNoteRecordStore) -> None:
        """The Note ends up in the destination Category."""
        _, destination, note = await _two_categories(store)

        assert await store.async_update_note(note.id, category_id=destination.id)

        assert store.get_note(note.id).category_id == destination.id

    async def test_preserves_everything_but_category_and_updated_at(
        self, store: HaNoteRecordStore
    ) -> None:
        """Only the Category and the update stamp change."""
        _, destination, note = await _two_categories(store)
        before = note.to_dict()

        assert await store.async_update_note(note.id, category_id=destination.id)

        after = store.get_note(note.id).to_dict()
        assert after["title"] == before["title"]
        assert after["content"] == before["content"]
        assert after["pinned"] == before["pinned"]
        assert after["created_at"] == before["created_at"]
        assert after["category_id"] == destination.id
        assert after["updated_at"] >= before["updated_at"]

    async def test_the_source_no_longer_holds_it(
        self, store: HaNoteRecordStore
    ) -> None:
        """A moved Note belongs to exactly one Category."""
        source, destination, note = await _two_categories(store)

        await store.async_update_note(note.id, category_id=destination.id)

        assert store.get_notes_by_category(source.id) == []
        assert [n.id for n in store.get_notes_by_category(destination.id)] == [note.id]

    async def test_unknown_destination_writes_nothing(
        self, store: HaNoteRecordStore
    ) -> None:
        """A Category that does not exist is refused, and nothing changes."""
        source, _, note = await _two_categories(store)
        before = store.get_note(note.id).to_dict()

        assert not await store.async_update_note(note.id, category_id="nope")

        assert store.get_note(note.id).to_dict() == before
        assert store.get_note(note.id).category_id == source.id

    async def test_a_refused_move_does_not_apply_the_other_fields(
        self, store: HaNoteRecordStore
    ) -> None:
        """A bad destination refuses the whole update, not just the move."""
        _, _, note = await _two_categories(store)

        assert not await store.async_update_note(
            note.id, title="Renamed", category_id="nope"
        )

        assert store.get_note(note.id).title == "Shopping list"


class TestServiceMove:
    """``note_update_note`` moves a Note and takes its entities along."""

    async def test_moves_the_note(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """The service applies the destination Category."""
        _, destination, note = await _two_categories(note_services)

        response = await hass.services.async_call(
            DOMAIN,
            UPDATE_NOTE_SERVICE,
            {"note_id": note.id, "category_id": destination.id},
            blocking=True,
            return_response=True,
        )

        assert response["note"]["category_id"] == destination.id
        assert note_services.get_note(note.id).category_id == destination.id

    async def test_entities_follow_to_the_destination_device(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """Both entities end under the destination device and none remain."""
        source, destination, note = await _two_categories(note_services)
        entity_ids = _register_note_entities(
            hass, note_services.entry, source, note
        )

        await hass.services.async_call(
            DOMAIN,
            UPDATE_NOTE_SERVICE,
            {"note_id": note.id, "category_id": destination.id},
            blocking=True,
        )

        dev_reg = dr.async_get(hass)
        ent_reg = er.async_get(hass)
        destination_device = dev_reg.async_get_device(
            identifiers={(DOMAIN, device_id(AREA, destination.id))}
        )
        source_device = dev_reg.async_get_device(
            identifiers={(DOMAIN, device_id(AREA, source.id))}
        )
        assert destination_device is not None

        for entity_id in entity_ids.values():
            assert ent_reg.async_get(entity_id).device_id == destination_device.id

        assert not [
            entry
            for entry in ent_reg.entities.values()
            if entry.device_id == source_device.id
        ]

    async def test_no_entity_is_orphaned_or_duplicated(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """The move re-points the entries it found; it creates none."""
        source, destination, note = await _two_categories(note_services)
        entity_ids = _register_note_entities(
            hass, note_services.entry, source, note
        )

        await hass.services.async_call(
            DOMAIN,
            UPDATE_NOTE_SERVICE,
            {"note_id": note.id, "category_id": destination.id},
            blocking=True,
        )

        ent_reg = er.async_get(hass)
        for platform, suffix in NOTE_ENTITIES:
            assert (
                ent_reg.async_get_entity_id(
                    platform, DOMAIN, note_unique_id(note.id, suffix)
                )
                == entity_ids[platform]
            )
        assert len(ent_reg.entities) == len(NOTE_ENTITIES)

    async def test_creates_the_device_of_an_empty_destination(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """A Category with no Notes yet has no device until one arrives."""
        source, destination, note = await _two_categories(note_services)
        _register_note_entities(hass, note_services.entry, source, note)

        dev_reg = dr.async_get(hass)
        assert (
            dev_reg.async_get_device(
                identifiers={(DOMAIN, device_id(AREA, destination.id))}
            )
            is None
        )

        await hass.services.async_call(
            DOMAIN,
            UPDATE_NOTE_SERVICE,
            {"note_id": note.id, "category_id": destination.id},
            blocking=True,
        )

        assert (
            dev_reg.async_get_device(
                identifiers={(DOMAIN, device_id(AREA, destination.id))}
            )
            is not None
        )

    async def test_unknown_destination_raises_and_changes_nothing(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """The error is translated, and the Note stays where it was."""
        source, _, note = await _two_categories(note_services)

        with pytest.raises(ServiceValidationError) as raised:
            await hass.services.async_call(
                DOMAIN,
                UPDATE_NOTE_SERVICE,
                {"note_id": note.id, "category_id": "nope"},
                blocking=True,
            )

        assert raised.value.translation_key == "note.category_not_found"
        assert note_services.get_note(note.id).category_id == source.id

    async def test_a_title_the_destination_already_holds_is_refused(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """A move carries its title, so it can collide without renaming."""
        source, destination, note = await _two_categories(note_services)
        await note_services.async_create_note(
            category_id=destination.id, title="Shopping list"
        )

        with pytest.raises(ServiceValidationError) as raised:
            await hass.services.async_call(
                DOMAIN,
                UPDATE_NOTE_SERVICE,
                {"note_id": note.id, "category_id": destination.id},
                blocking=True,
            )

        assert raised.value.translation_key == "note.title_duplicate"
        assert note_services.get_note(note.id).category_id == source.id

    async def test_a_title_only_the_source_holds_does_not_block_the_move(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """The duplicate check reads the destination, not the source."""
        source, destination, note = await _two_categories(note_services)
        await note_services.async_create_note(
            category_id=source.id, title="Another note"
        )

        await hass.services.async_call(
            DOMAIN,
            UPDATE_NOTE_SERVICE,
            {"note_id": note.id, "category_id": destination.id},
            blocking=True,
        )

        assert note_services.get_note(note.id).category_id == destination.id

    async def test_a_content_edit_is_not_a_move(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """Omitting ``category_id`` leaves the Category alone."""
        source, _, note = await _two_categories(note_services)

        await hass.services.async_call(
            DOMAIN,
            UPDATE_NOTE_SERVICE,
            {"note_id": note.id, "content": "bread"},
            blocking=True,
        )

        moved = note_services.get_note(note.id)
        assert moved.category_id == source.id
        assert moved.content == "bread"

    async def test_a_move_and_a_rename_apply_together(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """One call can do both, and both land."""
        _, destination, note = await _two_categories(note_services)

        await hass.services.async_call(
            DOMAIN,
            UPDATE_NOTE_SERVICE,
            {
                "note_id": note.id,
                "category_id": destination.id,
                "title": "Groceries",
            },
            blocking=True,
        )

        moved = note_services.get_note(note.id)
        assert moved.category_id == destination.id
        assert moved.title == "Groceries"


class TestWebSocketMove:
    """The same move over ``woow_ha_records/note/update_note``."""

    async def test_moves_the_note(
        self, ws_client, store: HaNoteRecordStore
    ) -> None:
        """The command applies the destination Category."""
        _, destination, note = await _two_categories(store)

        await ws_client.send_json(
            {
                "id": 1,
                "type": UPDATE_NOTE_WS,
                "note_id": note.id,
                "category_id": destination.id,
            }
        )
        response = await ws_client.receive_json()

        assert response["success"]
        assert response["result"]["category_id"] == destination.id
        assert store.get_note(note.id).category_id == destination.id

    async def test_preserves_everything_but_category_and_updated_at(
        self, ws_client, store: HaNoteRecordStore
    ) -> None:
        """Content, pinned state and creation time survive the move."""
        _, destination, note = await _two_categories(store)
        before = note.to_dict()

        await ws_client.send_json(
            {
                "id": 1,
                "type": UPDATE_NOTE_WS,
                "note_id": note.id,
                "category_id": destination.id,
            }
        )
        result = (await ws_client.receive_json())["result"]

        assert result["title"] == before["title"]
        assert result["content"] == before["content"]
        assert result["pinned"] == before["pinned"]
        assert result["created_at"] == before["created_at"]

    async def test_entities_follow_to_the_destination_device(
        self, hass: HomeAssistant, ws_client, store: HaNoteRecordStore
    ) -> None:
        """The WebSocket surface re-points the registry exactly as the service does."""
        source, destination, note = await _two_categories(store)
        entity_ids = _register_note_entities(hass, store.entry, source, note)

        await ws_client.send_json(
            {
                "id": 1,
                "type": UPDATE_NOTE_WS,
                "note_id": note.id,
                "category_id": destination.id,
            }
        )
        assert (await ws_client.receive_json())["success"]

        dev_reg = dr.async_get(hass)
        ent_reg = er.async_get(hass)
        destination_device = dev_reg.async_get_device(
            identifiers={(DOMAIN, device_id(AREA, destination.id))}
        )
        for entity_id in entity_ids.values():
            assert ent_reg.async_get(entity_id).device_id == destination_device.id

    async def test_unknown_destination_is_refused_and_changes_nothing(
        self, ws_client, store: HaNoteRecordStore
    ) -> None:
        """A missing Category is ``not_found``, and the Note does not move."""
        source, _, note = await _two_categories(store)

        await ws_client.send_json(
            {
                "id": 1,
                "type": UPDATE_NOTE_WS,
                "note_id": note.id,
                "category_id": "nope",
            }
        )
        response = await ws_client.receive_json()

        assert not response["success"]
        assert response["error"]["code"] == "not_found"
        assert store.get_note(note.id).category_id == source.id

    async def test_a_title_the_destination_already_holds_is_refused(
        self, ws_client, store: HaNoteRecordStore
    ) -> None:
        """Both surfaces refuse the same collision with the same code."""
        source, destination, note = await _two_categories(store)
        await store.async_create_note(
            category_id=destination.id, title="Shopping list"
        )

        await ws_client.send_json(
            {
                "id": 1,
                "type": UPDATE_NOTE_WS,
                "note_id": note.id,
                "category_id": destination.id,
            }
        )
        response = await ws_client.receive_json()

        assert not response["success"]
        assert response["error"]["code"] == "duplicate"
        assert store.get_note(note.id).category_id == source.id

    async def test_a_content_edit_is_not_a_move(
        self, ws_client, store: HaNoteRecordStore
    ) -> None:
        """Omitting ``category_id`` leaves the Category alone."""
        source, _, note = await _two_categories(store)

        await ws_client.send_json(
            {
                "id": 1,
                "type": UPDATE_NOTE_WS,
                "note_id": note.id,
                "content": "bread",
            }
        )
        assert (await ws_client.receive_json())["success"]

        assert store.get_note(note.id).category_id == source.id
