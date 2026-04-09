"""Switch entity for Ha Note Record integration."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import ATTR_NOTE_ID, DOMAIN, ICON_PINNED, ICON_UNPINNED
from .entity import HaNoteRecordEntity
from .store import Category, HaNoteRecordStore, Note

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up switch entities from a config entry."""
    store: HaNoteRecordStore = entry.runtime_data

    # Track entity IDs to avoid duplicates
    known_note_ids: set[str] = set()
    entities: list[HaNoteRecordSwitchEntity] = []

    for note in store.notes:
        category = store.get_category(note.category_id)
        if category:
            entities.append(HaNoteRecordSwitchEntity(store, note, category))
            known_note_ids.add(note.id)

    async_add_entities(entities)

    @callback
    def async_add_new_entities() -> None:
        """Add entities for newly created notes."""
        new_entities: list[HaNoteRecordSwitchEntity] = []

        # Reconcile known_note_ids — remove deleted notes
        current_ids = {n.id for n in store.notes}
        known_note_ids.intersection_update(current_ids)

        for note in store.notes:
            if note.id not in known_note_ids:
                category = store.get_category(note.category_id)
                if category:
                    entity = HaNoteRecordSwitchEntity(store, note, category)
                    new_entities.append(entity)
                    known_note_ids.add(note.id)

        if new_entities:
            async_add_entities(new_entities)

    entry.async_on_unload(store.async_add_listener(async_add_new_entities))


class HaNoteRecordSwitchEntity(HaNoteRecordEntity, SwitchEntity):
    """Switch entity for note pinned status."""

    def __init__(
        self,
        store: HaNoteRecordStore,
        note: Note,
        category: Category,
    ) -> None:
        """Initialize the switch entity."""
        super().__init__(store, note, category)
        self._attr_unique_id = f"{DOMAIN}_{category.id}_{note.id}_pinned"
        self._attr_name = f"{note.title} Pinned"

    @property
    def is_on(self) -> bool | None:
        """Return True if the note is pinned."""
        if not self._refresh_note():
            return None
        return self._note.pinned

    @property
    def icon(self) -> str:
        """Return the icon based on pinned status."""
        return ICON_PINNED if self.is_on else ICON_UNPINNED

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return extra state attributes."""
        return {
            ATTR_NOTE_ID: self._note.id,
        }

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Pin the note."""
        await self._store.async_update_note_pinned(self._note.id, True)
        if self._refresh_note():
            self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Unpin the note."""
        await self._store.async_update_note_pinned(self._note.id, False)
        if self._refresh_note():
            self.async_write_ha_state()
