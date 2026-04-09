"""Fixtures for ha_health_record tests."""
from __future__ import annotations

from types import MappingProxyType
from unittest.mock import AsyncMock, patch

import pytest

from homeassistant.core import HomeAssistant

from custom_components.ha_health_record.const import (
    CONF_MEMBER_ID,
    CONF_MEMBER_NAME,
    CONF_RECORD_NAME,
    CONF_RECORD_SETS,
    CONF_RECORD_TYPE,
    CONF_RECORD_UNIT,
    DOMAIN,
)
from custom_components.ha_health_record.coordinator import HealthRecordCoordinator

MOCK_MEMBER_ID = "test_member"
MOCK_MEMBER_NAME = "Test Member"

MOCK_RECORD_SETS = [
    {
        CONF_RECORD_TYPE: "feeding",
        CONF_RECORD_NAME: "Feeding",
        CONF_RECORD_UNIT: "ml",
    },
    {
        CONF_RECORD_TYPE: "sleep",
        CONF_RECORD_NAME: "Sleep",
        CONF_RECORD_UNIT: "min",
    },
    {
        CONF_RECORD_TYPE: "weight",
        CONF_RECORD_NAME: "Weight",
        CONF_RECORD_UNIT: "kg",
    },
]


@pytest.fixture
def mock_config_entry(hass: HomeAssistant):
    """Create a mock config entry for ha_health_record."""
    from homeassistant.config_entries import ConfigEntry

    entry = ConfigEntry(
        version=2,
        minor_version=1,
        domain=DOMAIN,
        title=MOCK_MEMBER_NAME,
        data={
            CONF_MEMBER_ID: MOCK_MEMBER_ID,
            CONF_MEMBER_NAME: MOCK_MEMBER_NAME,
        },
        source="user",
        options={CONF_RECORD_SETS: MOCK_RECORD_SETS},
        unique_id=MOCK_MEMBER_ID,
        discovery_keys=MappingProxyType({}),
    )
    entry.hass = hass
    return entry


@pytest.fixture
def coordinator(hass: HomeAssistant, mock_config_entry) -> HealthRecordCoordinator:
    """Create a HealthRecordCoordinator with mocked storage."""
    coord = HealthRecordCoordinator(hass, mock_config_entry)
    # Replace store with mock to avoid actual file I/O
    coord._store = AsyncMock()
    coord._store.async_load = AsyncMock(return_value=None)
    coord._store.async_delay_save = lambda *a, **kw: None
    return coord
