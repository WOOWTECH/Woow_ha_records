"""Number platform for Ha Health Record integration."""
from __future__ import annotations

import logging
import math

from homeassistant.components.number import NumberEntity, NumberMode
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
    """Set up number entities from a config entry."""
    coordinator = entry.runtime_data

    entities: list[NumberEntity] = []

    for type_id in coordinator.record_sets:
        entities.append(
            RecordValueNumber(
                coordinator=coordinator,
                type_id=type_id,
            )
        )

    async_add_entities(entities)


class RecordValueNumber(NumberEntity):
    """Number entity for record value input."""

    _attr_entity_category = EntityCategory.CONFIG
    _attr_has_entity_name = True
    _attr_mode = NumberMode.BOX
    _attr_native_min_value = 0
    _attr_native_max_value = 10000
    _attr_native_step = 0.1
    _attr_translation_key = "record_value"

    def __init__(
        self,
        coordinator: HealthRecordCoordinator,
        type_id: str,
    ) -> None:
        """Initialize the number entity."""
        self._coordinator = coordinator
        self._type_id = type_id
        record_set = coordinator.get_record_set(type_id)

        self._attr_unique_id = f"{coordinator.member_id}_{type_id}_value"
        self._attr_translation_placeholders = {"record_name": record_set.name}
        self._attr_native_unit_of_measurement = record_set.unit
        self._attr_device_info = coordinator.get_device_info()
        self._attr_icon = "mdi:numeric"

    @property
    def native_value(self) -> float | None:
        """Return the current value."""
        record_set = self._coordinator.get_record_set(self._type_id)
        return record_set.current_value if record_set else None

    async def async_set_native_value(self, value: float) -> None:
        """Set the value."""
        if math.isnan(value) or math.isinf(value):
            raise ValueError(f"Invalid value: {value} (NaN/Infinity not allowed)")
        self._coordinator.set_record_value(self._type_id, value)
        self.async_write_ha_state()
