"""Text platform for Ha Health Record integration."""
from __future__ import annotations

import logging

from homeassistant.components.text import TextEntity, TextMode
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import HaHealthRecordConfigEntry
from .coordinator import HealthRecordCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HaHealthRecordConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up text entities from a config entry."""
    coordinator = entry.runtime_data

    entities: list[TextEntity] = []

    for type_id in coordinator.record_sets:
        entities.append(
            RecordNoteText(
                coordinator=coordinator,
                type_id=type_id,
            )
        )

    async_add_entities(entities)


class RecordNoteText(TextEntity):
    """Text entity for record note input."""

    _attr_entity_category = EntityCategory.CONFIG
    _attr_has_entity_name = True
    _attr_mode = TextMode.TEXT
    _attr_native_max = 255
    _attr_translation_key = "record_note"

    def __init__(
        self,
        coordinator: HealthRecordCoordinator,
        type_id: str,
    ) -> None:
        """Initialize the text entity."""
        self._coordinator = coordinator
        self._type_id = type_id
        record_set = coordinator.get_record_set(type_id)

        self._attr_unique_id = f"{coordinator.member_id}_{type_id}_note"
        self._attr_translation_placeholders = {"record_name": record_set.name}
        self._attr_device_info = coordinator.get_device_info()
        self._attr_icon = "mdi:note-text"

    @property
    def native_value(self) -> str | None:
        """Return the current value."""
        record_set = self._coordinator.get_record_set(self._type_id)
        return record_set.current_note if record_set else None

    async def async_set_value(self, value: str) -> None:
        """Set the value."""
        self._coordinator.set_record_note(self._type_id, value)
        self.async_write_ha_state()
