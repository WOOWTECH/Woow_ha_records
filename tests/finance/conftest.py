"""Fixtures for the finance Area."""
from __future__ import annotations

from types import MappingProxyType
from unittest.mock import AsyncMock

import pytest
from homeassistant.core import HomeAssistant

from custom_components.woow_ha_records.areas.finance.const import DOMAIN
from custom_components.woow_ha_records.areas.finance.models import Account, FinanceData
from custom_components.woow_ha_records.areas.finance.store import FinanceStore


@pytest.fixture
def mock_config_entry(hass: HomeAssistant):
    """Create a mock config entry."""
    from homeassistant.config_entries import ConfigEntry

    entry = ConfigEntry(
        version=1,
        minor_version=1,
        domain=DOMAIN,
        title="Test Account",
        data={
            "account_id": "test_account",
            "account_name": "Test Account",
        },
        source="user",
        options={
            "low_balance_threshold": 1000.0,
            "currency": "NTD",
        },
        unique_id="test_account",
        discovery_keys=MappingProxyType({}),
        subentries_data=(),
    )
    entry.hass = hass
    return entry


@pytest.fixture
def finance_store(hass: HomeAssistant) -> FinanceStore:
    """Create a FinanceStore with mocked storage."""
    store = FinanceStore(hass)
    store._store = AsyncMock()
    store._store.async_load = AsyncMock(return_value=None)
    store._store.async_save = AsyncMock()
    return store


@pytest.fixture
def finance_data_with_account() -> FinanceData:
    """Create FinanceData with a test account."""
    data = FinanceData()
    account = Account(id="test_account", name="Test Account", balance=5000.0)
    data.add_account(account)
    return data
