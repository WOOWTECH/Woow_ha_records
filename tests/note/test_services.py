"""``note_delete_category`` will not cascade unless the caller says so.

Deleting a Category destroys every Note filed under it. The note panel already
guards this: it names the Category, counts its Notes, and makes the user type
the name back. The service and WebSocket surfaces guarded nothing, and
``services.yaml`` points AI assistants straight at the service. Issue #45.

The guard was written when a Note had no escape route at all. #43 gave it one,
so the refusal now tells a caller something they can act on: move the Notes out
with ``note_update_note`` and the Category deletes without ``force``.

So the cascade is now opt-in. Without ``force`` the call is refused and
nothing is deleted; with it the behaviour is exactly what it always was, which
is why the panel passes ``force: true`` and its UX does not change.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError

from custom_components.woow_ha_records.areas.note.store import HaNoteRecordStore
from custom_components.woow_ha_records.const import DOMAIN
from custom_components.woow_ha_records.runtime import WoowRecordsData
from custom_components.woow_ha_records.services import async_register_services

DELETE_CATEGORY = "note_delete_category"

STRINGS = (
    Path(__file__).parent.parent.parent
    / "custom_components"
    / "woow_ha_records"
    / "strings.json"
)


@pytest.fixture
def note_services(hass: HomeAssistant, store: HaNoteRecordStore) -> HaNoteRecordStore:
    """Register the services against a store the handlers can reach.

    Handlers receive only a ``ServiceCall``, so they read the runtime record
    out of ``hass.data``. Only the note Area is exercised here, and these
    handlers never touch the other three.
    """
    hass.data[DOMAIN] = WoowRecordsData(
        finance=None,  # type: ignore[arg-type]
        asset=None,  # type: ignore[arg-type]
        health=None,  # type: ignore[arg-type]
        note=store,
    )
    async_register_services(hass)
    return store


async def _category_holding_notes(
    store: HaNoteRecordStore, count: int
) -> tuple[str, str]:
    """Create a Category with *count* Notes in it; return its id and name."""
    category = await store.async_create_category("Recipes")
    for index in range(count):
        await store.async_create_note(
            category_id=category.id,
            title=f"Note {index}",
            content="",
            pinned=False,
        )
    return category.id, category.name


class TestDeleteCategoryGuard:
    """A Category holding Notes is deleted only on an explicit opt-in."""

    async def test_refuses_a_category_that_still_holds_notes(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """The default call is refused, and nothing is deleted."""
        category_id, _ = await _category_holding_notes(note_services, 3)

        with pytest.raises(ServiceValidationError) as caught:
            await hass.services.async_call(
                DOMAIN,
                DELETE_CATEGORY,
                {"category_id": category_id},
                blocking=True,
            )

        assert caught.value.translation_key == "note.category_not_empty"
        assert note_services.get_category(category_id) is not None
        assert len(note_services.get_notes_by_category(category_id)) == 3

    async def test_refusal_names_the_category_and_counts_its_notes(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """The caller is told what they would have destroyed.

        A bare "refused" leaves an assistant no way to judge whether the
        opt-in is warranted. The count is the whole point of the guard.
        """
        category_id, name = await _category_holding_notes(note_services, 2)

        with pytest.raises(ServiceValidationError) as caught:
            await hass.services.async_call(
                DOMAIN,
                DELETE_CATEGORY,
                {"category_id": category_id},
                blocking=True,
            )

        assert caught.value.translation_placeholders == {
            "name": name,
            "note_count": "2",
        }

    async def test_renders_a_message_with_nothing_left_unfilled(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """The placeholders raised actually fill the published message.

        Home Assistant drops the whole ``.format()`` call when one
        placeholder is missing, showing the raw template instead. Issue #27.
        """
        message = json.loads(STRINGS.read_text(encoding="utf-8"))["exceptions"][
            "note"
        ]["category_not_empty"]["message"]
        category_id, name = await _category_holding_notes(note_services, 1)

        with pytest.raises(ServiceValidationError) as caught:
            await hass.services.async_call(
                DOMAIN,
                DELETE_CATEGORY,
                {"category_id": category_id},
                blocking=True,
            )

        rendered = message.format(**caught.value.translation_placeholders)
        assert "{" not in rendered
        assert name in rendered

    async def test_force_cascade_deletes_the_notes(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """``force: true`` is the behaviour the panel has always had."""
        category_id, _ = await _category_holding_notes(note_services, 3)

        result = await hass.services.async_call(
            DOMAIN,
            DELETE_CATEGORY,
            {"category_id": category_id, "force": True},
            blocking=True,
            return_response=True,
        )

        assert result == {"success": True}
        assert note_services.get_category(category_id) is None
        assert note_services.notes == []

    async def test_an_empty_category_needs_no_force(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """The guard is about the cascade, not about deleting at all."""
        category = await note_services.async_create_category("Empty")

        result = await hass.services.async_call(
            DOMAIN,
            DELETE_CATEGORY,
            {"category_id": category.id},
            blocking=True,
            return_response=True,
        )

        assert result == {"success": True}
        assert note_services.get_category(category.id) is None

    async def test_force_false_is_read_as_no_opt_in(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """Sending the flag off is the same as not sending it.

        Worth pinning: the handler reads the flag with a ``False`` default,
        so an explicit ``force: false`` must not fall through to the cascade.
        """
        category_id, _ = await _category_holding_notes(note_services, 1)

        with pytest.raises(ServiceValidationError) as caught:
            await hass.services.async_call(
                DOMAIN,
                DELETE_CATEGORY,
                {"category_id": category_id, "force": False},
                blocking=True,
            )

        assert caught.value.translation_key == "note.category_not_empty"
        assert len(note_services.notes) == 1

    async def test_a_missing_category_is_still_reported_as_missing(
        self, hass: HomeAssistant, note_services: HaNoteRecordStore
    ) -> None:
        """The guard runs after the existence check, not instead of it."""
        with pytest.raises(ServiceValidationError) as caught:
            await hass.services.async_call(
                DOMAIN,
                DELETE_CATEGORY,
                {"category_id": "no-such-category", "force": True},
                blocking=True,
            )

        assert caught.value.translation_key == "note.category_not_found"
