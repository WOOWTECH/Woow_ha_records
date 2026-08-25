"""Fixtures for the note Area."""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from homeassistant.core import HomeAssistant

from custom_components.woow_ha_records.areas.note.store import HaNoteRecordStore


@pytest.fixture
def mock_config_entry(hass: HomeAssistant):
    """The integration's single config entry."""
    from homeassistant.config_entries import ConfigEntry
    from types import MappingProxyType

    from custom_components.woow_ha_records.const import DOMAIN

    entry = ConfigEntry(
        version=1,
        minor_version=1,
        domain=DOMAIN,
        title="Woow HA Records",
        data={},
        source="user",
        options={},
        unique_id=DOMAIN,
        discovery_keys=MappingProxyType({}),
    )
    entry.hass = hass
    return entry


@pytest.fixture
def store(hass: HomeAssistant, mock_config_entry) -> HaNoteRecordStore:
    """Create a HaNoteRecordStore with mocked storage."""
    s = HaNoteRecordStore(hass, mock_config_entry)
    s._store = AsyncMock()
    s._store.async_load = AsyncMock(return_value=None)
    s._store.async_save = AsyncMock()
    return s
