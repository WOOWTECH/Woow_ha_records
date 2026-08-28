"""The note Area's ``delete_category`` command guards its cascade too.

The service surface is not the only unguarded way in — the panel drives the
same deletion over WebSocket, and any other client can too. Both surfaces take
the same ``force`` opt-in so neither is the soft way round the other.
Issue #45; the service side is covered in ``test_services.py``.
"""
from __future__ import annotations

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from custom_components.woow_ha_records.areas.note.store import HaNoteRecordStore
from custom_components.woow_ha_records.const import DOMAIN
from custom_components.woow_ha_records.runtime import WoowRecordsData
from custom_components.woow_ha_records.websocket import (
    async_register_websocket_commands,
)

DELETE_CATEGORY = "woow_ha_records/note/delete_category"


@pytest.fixture
async def ws_client(hass: HomeAssistant, store: HaNoteRecordStore, hass_ws_client):
    """A connected client with the note commands registered.

    Only the note Area's store is real; these commands never reach the other
    three.
    """
    assert await async_setup_component(hass, "websocket_api", {})
    hass.data[DOMAIN] = WoowRecordsData(
        finance=None,  # type: ignore[arg-type]
        asset=None,  # type: ignore[arg-type]
        health=None,  # type: ignore[arg-type]
        note=store,
    )
    async_register_websocket_commands(hass)
    return await hass_ws_client(hass)


async def _category_holding_notes(store: HaNoteRecordStore, count: int) -> str:
    """Create a Category with *count* Notes in it and return its id."""
    category = await store.async_create_category("Recipes")
    for index in range(count):
        await store.async_create_note(
            category_id=category.id,
            title=f"Note {index}",
            content="",
            pinned=False,
        )
    return category.id


class TestDeleteCategoryGuard:
    """A Category holding Notes is deleted only on an explicit opt-in."""

    async def test_refuses_a_category_that_still_holds_notes(
        self, ws_client, store: HaNoteRecordStore
    ) -> None:
        """The default call is refused, and nothing is deleted."""
        category_id = await _category_holding_notes(store, 3)

        await ws_client.send_json(
            {"id": 1, "type": DELETE_CATEGORY, "category_id": category_id}
        )
        response = await ws_client.receive_json()

        assert not response["success"]
        assert response["error"]["code"] == "not_empty"
        assert store.get_category(category_id) is not None
        assert len(store.get_notes_by_category(category_id)) == 3

    async def test_the_refusal_counts_what_it_refused_to_destroy(
        self, ws_client, store: HaNoteRecordStore
    ) -> None:
        """The count is the whole point of the guard, so it must be said."""
        category_id = await _category_holding_notes(store, 2)

        await ws_client.send_json(
            {"id": 1, "type": DELETE_CATEGORY, "category_id": category_id}
        )
        response = await ws_client.receive_json()

        assert "2" in response["error"]["message"]

    async def test_force_cascade_deletes_the_notes(
        self, ws_client, store: HaNoteRecordStore
    ) -> None:
        """``force: true`` is the behaviour the panel has always had."""
        category_id = await _category_holding_notes(store, 3)

        await ws_client.send_json(
            {
                "id": 1,
                "type": DELETE_CATEGORY,
                "category_id": category_id,
                "force": True,
            }
        )
        response = await ws_client.receive_json()

        assert response["success"]
        assert response["result"] == {"deleted": True}
        assert store.get_category(category_id) is None
        assert store.notes == []

    async def test_an_empty_category_needs_no_force(
        self, ws_client, store: HaNoteRecordStore
    ) -> None:
        """The guard is about the cascade, not about deleting at all."""
        category = await store.async_create_category("Empty")

        await ws_client.send_json(
            {"id": 1, "type": DELETE_CATEGORY, "category_id": category.id}
        )
        response = await ws_client.receive_json()

        assert response["success"]
        assert store.get_category(category.id) is None

    async def test_force_false_is_read_as_no_opt_in(
        self, ws_client, store: HaNoteRecordStore
    ) -> None:
        """Sending the flag off is the same as not sending it."""
        category_id = await _category_holding_notes(store, 1)

        await ws_client.send_json(
            {
                "id": 1,
                "type": DELETE_CATEGORY,
                "category_id": category_id,
                "force": False,
            }
        )
        response = await ws_client.receive_json()

        assert response["error"]["code"] == "not_empty"
        assert len(store.notes) == 1

    async def test_a_missing_category_is_still_reported_as_missing(
        self, ws_client, store: HaNoteRecordStore
    ) -> None:
        """The guard runs after the existence check, not instead of it."""
        await ws_client.send_json(
            {
                "id": 1,
                "type": DELETE_CATEGORY,
                "category_id": "no-such-category",
                "force": True,
            }
        )
        response = await ws_client.receive_json()

        assert response["error"]["code"] == "not_found"
