"""Fixtures for the asset Area."""
from __future__ import annotations

from types import MappingProxyType
from unittest.mock import AsyncMock

import pytest

from homeassistant.core import HomeAssistant

from custom_components.woow_ha_records.areas.asset.const import DOMAIN
from custom_components.woow_ha_records.areas.asset.coordinator import AssetCoordinator


@pytest.fixture
def mock_config_entry(hass: HomeAssistant):
    """Create a mock config entry."""
    from homeassistant.config_entries import ConfigEntry

    entry = ConfigEntry(
        version=1,
        minor_version=1,
        domain=DOMAIN,
        title="Asset Record",
        data={},
        source="user",
        options={},
        unique_id=DOMAIN,
        discovery_keys=MappingProxyType({}),
    )
    entry.hass = hass
    return entry


@pytest.fixture
def coordinator(hass: HomeAssistant, mock_config_entry) -> AssetCoordinator:
    """Create an AssetCoordinator with mocked storage."""
    coord = AssetCoordinator(hass, mock_config_entry)
    coord._store = AsyncMock()
    coord._store.async_load = AsyncMock(return_value=None)
    coord._store.async_save = AsyncMock()
    return coord
