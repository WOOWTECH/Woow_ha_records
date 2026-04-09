"""Sensor platform for Ha Health Record integration."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import HaHealthRecordConfigEntry
from .coordinator import (
    HealthRecordCoordinator,
    signal_record_updated,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HaHealthRecordConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up sensor entities from a config entry."""
    coordinator = entry.runtime_data

    entities: list[SensorEntity] = []

    for type_id in coordinator.record_sets:
        entities.append(
            RecordSensor(
                coordinator=coordinator,
                type_id=type_id,
            )
        )

    async_add_entities(entities)


class RecordSensor(SensorEntity):
    """Sensor showing the last record value."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_translation_key = "record"

    def __init__(
        self,
        coordinator: HealthRecordCoordinator,
        type_id: str,
    ) -> None:
        """Initialize the sensor."""
        self._coordinator = coordinator
        self._type_id = type_id
        record_set = coordinator.get_record_set(type_id)

        self._attr_unique_id = f"{coordinator.member_id}_{type_id}_record"
        self._attr_translation_placeholders = {"record_name": record_set.name}
        self._attr_native_unit_of_measurement = record_set.unit
        self._attr_device_info = coordinator.get_device_info()
        self._attr_icon = "mdi:clipboard-text-clock"

    async def async_added_to_hass(self) -> None:
        """Subscribe to dispatcher signals when added to hass."""
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                signal_record_updated(
                    self._coordinator.member_id, self._type_id
                ),
                self._handle_update,
            )
        )

    @callback
    def _handle_update(self) -> None:
        """Handle update signal."""
        self.async_write_ha_state()

    @property
    def native_value(self) -> float | None:
        """Return the last recorded value."""
        record_set = self._coordinator.get_record_set(self._type_id)
        if record_set and record_set.last_record:
            return record_set.last_record.value
        return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return additional attributes."""
        record_set = self._coordinator.get_record_set(self._type_id)
        if not record_set or not record_set.last_record:
            return {}

        record = record_set.last_record
        attrs = {
            "record_name": record_set.name,
            "unit": record_set.unit,
            "note": record.note,
        }
        if record.timestamp:
            attrs["timestamp"] = record.timestamp.isoformat()

        return attrs
