"""Fixtures for the health Area."""
from __future__ import annotations

from types import MappingProxyType
from unittest.mock import AsyncMock, patch

import pytest

from homeassistant.core import HomeAssistant

from custom_components.woow_ha_records.areas.health.const import (
    CONF_MEMBER_ID,
    CONF_MEMBER_NAME,
    CONF_RECORD_NAME,
    CONF_RECORD_SETS,
    CONF_RECORD_TYPE,
    CONF_RECORD_UNIT,
    DOMAIN,
)
from custom_components.woow_ha_records.areas.health.area import HealthArea
from custom_components.woow_ha_records.areas.health.coordinator import HealthRecordCoordinator

MOCK_MEMBER_ID = "test_member"
MOCK_MEMBER_NAME = "Test Member"

# Record Set definitions are stored data now, not config entry options, so the
# fixture speaks the store's shape.
MOCK_RECORD_SETS = [
    {"type_id": "feeding", "name": "Feeding", "unit": "ml"},
    {"type_id": "sleep", "name": "Sleep", "unit": "min"},
    {"type_id": "weight", "name": "Weight", "unit": "kg"},
]

# The old config-entry options shape, still used by the mock entry below.
MOCK_RECORD_SET_OPTIONS = [
    {
        CONF_RECORD_TYPE: rs["type_id"],
        CONF_RECORD_NAME: rs["name"],
        CONF_RECORD_UNIT: rs["unit"],
    }
    for rs in MOCK_RECORD_SETS
]


@pytest.fixture
def mock_config_entry(hass: HomeAssistant):
    """Create a mock config entry."""
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
        options={CONF_RECORD_SETS: MOCK_RECORD_SET_OPTIONS},
        unique_id=MOCK_MEMBER_ID,
        discovery_keys=MappingProxyType({}),
    )
    entry.hass = hass
    return entry


@pytest.fixture
def area(hass: HomeAssistant, mock_config_entry) -> HealthArea:
    """Create a HealthArea with storage mocked out."""
    a = HealthArea(hass, mock_config_entry)
    a._store = AsyncMock()
    a._store.async_load = AsyncMock(return_value=None)
    a._store.async_delay_save = lambda *args, **kwargs: None
    return a


@pytest.fixture
def coordinator(hass: HomeAssistant, area: HealthArea) -> HealthRecordCoordinator:
    """Create a Member coordinator inside a mocked Area."""
    coord = HealthRecordCoordinator(hass, area, MOCK_MEMBER_ID, MOCK_MEMBER_NAME)
    coord.load_from_dict(
        {"name": MOCK_MEMBER_NAME, "record_sets": MOCK_RECORD_SETS, "records": []}
    )
    area.members[MOCK_MEMBER_ID] = coord
    return coord
