"""Tests for the finance Area store."""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from homeassistant.core import HomeAssistant

from custom_components.woow_ha_records.areas.finance.models import Account, FinanceData
from custom_components.woow_ha_records.areas.finance.store import FinanceStore


class TestFinanceStore:
    """Tests for FinanceStore."""

    async def test_async_load_empty(self, finance_store):
        """Test loading with empty storage."""
        data = await finance_store.async_load()
        assert isinstance(data, FinanceData)
        assert len(data.accounts) == 0

    async def test_async_load_with_data(self, finance_store):
        """Test loading with existing data."""
        finance_store._store.async_load = AsyncMock(return_value={
            "accounts": {
                "acc1": {
                    "name": "Main",
                    "balance": 5000.0,
                    "notes": "",
                    "transactions": [],
                    "recurring_plans": {},
                },
            },
        })
        data = await finance_store.async_load()
        assert len(data.accounts) == 1
        assert data.get_account("acc1").balance == 5000.0

    async def test_async_load_cached(self, finance_store):
        """Test second load returns cached data without re-reading."""
        await finance_store.async_load()
        finance_store._store.async_load.reset_mock()

        data = await finance_store.async_load()
        assert isinstance(data, FinanceData)
        # Should NOT have called storage again
        finance_store._store.async_load.assert_not_called()

    async def test_async_save(self, finance_store):
        """Test saving data."""
        await finance_store.async_load()
        finance_store.data.add_account(Account(id="acc1", name="Test", balance=100))

        await finance_store.async_save()
        finance_store._store.async_save.assert_called_once()

    async def test_async_save_skips_when_no_data(self, finance_store):
        """Test save does nothing if data is None."""
        finance_store._data = None
        await finance_store.async_save()
        finance_store._store.async_save.assert_not_called()

    async def test_data_property_lazy_init(self, finance_store):
        """Test data property creates empty FinanceData if None."""
        finance_store._data = None
        data = finance_store.data
        assert isinstance(data, FinanceData)
        assert len(data.accounts) == 0

    async def test_async_remove(self, finance_store):
        """Test removing all data."""
        await finance_store.async_load()
        finance_store.data.add_account(Account(id="acc1", name="Test"))

        await finance_store.async_remove()
        assert len(finance_store.data.accounts) == 0
        finance_store._store.async_remove.assert_called_once()
