"""Fixtures for the asset Area."""
from __future__ import annotations

from types import MappingProxyType
from unittest.mock import AsyncMock

import pytest
from homeassistant.core import HomeAssistant

from custom_components.woow_ha_records.areas.asset.const import DOMAIN
from custom_components.woow_ha_records.areas.asset.coordinator import (
    AssetCoordinator,
    Category,
)
from custom_components.woow_ha_records.const import DOMAIN as INTEGRATION_DOMAIN
from custom_components.woow_ha_records.runtime import WoowRecordsData


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
        subentries_data=(),
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


@pytest.fixture
def asset_runtime(
    hass: HomeAssistant, coordinator: AssetCoordinator
) -> AssetCoordinator:
    """Put the coordinator where service and WebSocket handlers look for it.

    Neither surface is handed the coordinator — a handler gets only a
    ``ServiceCall`` or a ``msg``, and reads the runtime record out of
    ``hass.data``. Only the asset Area is filled in; these handlers never
    reach the other three.

    Registering the handlers is left to each test module, because the two
    surfaces register differently. This fixture is only the state they share.
    """
    hass.data[INTEGRATION_DOMAIN] = WoowRecordsData(
        finance=None,  # type: ignore[arg-type]
        asset=coordinator,
        health=None,  # type: ignore[arg-type]
        note=None,  # type: ignore[arg-type]
    )
    return coordinator


@pytest.fixture
def category_holding_assets(coordinator: AssetCoordinator):
    """Return a builder for a Category with *count* Assets filed under it.

    Both delete_category surfaces are tested against the same fixture shape,
    so the guard cannot be shown working on one surface's idea of "a category
    with assets in it" and not the other's.
    """

    async def _build(count: int, name: str = "Appliances") -> Category:
        category = await coordinator.async_create_category(name)
        for index in range(count):
            await coordinator.async_create_asset_full(
                f"Asset {index}", category_id=category.id
            )
        return category

    return _build
