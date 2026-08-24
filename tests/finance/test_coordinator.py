"""Tests for the finance Area coordinator."""
from __future__ import annotations

from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from homeassistant.core import HomeAssistant

from custom_components.woow_ha_records.areas.finance.const import (
    EVENT_BALANCE_ADJUSTED,
    EVENT_LOW_BALANCE,
    EVENT_TRANSACTION_ADDED,
    FREQUENCY_DAILY,
    FREQUENCY_MONTHLY,
    FREQUENCY_WEEKLY,
    FREQUENCY_YEARLY,
)
from custom_components.woow_ha_records.areas.finance.coordinator import FinanceCoordinator
from custom_components.woow_ha_records.areas.finance.models import Account, FinanceData, RecurringPlan


class TestCalculateNextDate:
    """Tests for _calculate_next_date."""

    def _make_coordinator(self, hass, mock_config_entry, finance_store):
        """Create a coordinator for testing."""
        coord = FinanceCoordinator(hass, mock_config_entry, finance_store, "test_account")
        return coord

    async def test_daily(self, hass, mock_config_entry, finance_store):
        """Test daily frequency returns from_date."""
        coord = self._make_coordinator(hass, mock_config_entry, finance_store)
        plan = RecurringPlan(id="p1", title="T", amount=1, frequency=FREQUENCY_DAILY, day=1)
        result = coord._calculate_next_date(plan, date(2025, 6, 15))
        assert result == date(2025, 6, 15)

    async def test_weekly_future_day(self, hass, mock_config_entry, finance_store):
        """Test weekly: target day is after from_date's weekday."""
        coord = self._make_coordinator(hass, mock_config_entry, finance_store)
        # from_date is Monday (isoweekday=1), target day=3 (Wednesday)
        plan = RecurringPlan(id="p1", title="T", amount=1, frequency=FREQUENCY_WEEKLY, day=3)
        result = coord._calculate_next_date(plan, date(2025, 6, 16))  # Monday
        assert result == date(2025, 6, 18)  # Wednesday

    async def test_weekly_same_day_wraps(self, hass, mock_config_entry, finance_store):
        """Test weekly: target day is same as or before from_date wraps to next week."""
        coord = self._make_coordinator(hass, mock_config_entry, finance_store)
        # from_date is Wednesday (isoweekday=3), target day=3
        plan = RecurringPlan(id="p1", title="T", amount=1, frequency=FREQUENCY_WEEKLY, day=3)
        result = coord._calculate_next_date(plan, date(2025, 6, 18))  # Wednesday
        assert result == date(2025, 6, 25)  # Next Wednesday

    async def test_weekly_day_clamped(self, hass, mock_config_entry, finance_store):
        """Test weekly: day>7 is clamped to 7 (Sunday)."""
        coord = self._make_coordinator(hass, mock_config_entry, finance_store)
        plan = RecurringPlan(id="p1", title="T", amount=1, frequency=FREQUENCY_WEEKLY, day=99)
        result = coord._calculate_next_date(plan, date(2025, 6, 16))  # Monday
        # day clamped to 7 (Sunday), next Sunday from Monday is 6 days ahead
        assert result.isoweekday() == 7

    async def test_monthly_future_day(self, hass, mock_config_entry, finance_store):
        """Test monthly: target day is after from_date's day."""
        coord = self._make_coordinator(hass, mock_config_entry, finance_store)
        plan = RecurringPlan(id="p1", title="T", amount=1, frequency=FREQUENCY_MONTHLY, day=25)
        result = coord._calculate_next_date(plan, date(2025, 6, 10))
        assert result == date(2025, 6, 25)

    async def test_monthly_past_day_wraps(self, hass, mock_config_entry, finance_store):
        """Test monthly: target day passed wraps to next month."""
        coord = self._make_coordinator(hass, mock_config_entry, finance_store)
        plan = RecurringPlan(id="p1", title="T", amount=1, frequency=FREQUENCY_MONTHLY, day=5)
        result = coord._calculate_next_date(plan, date(2025, 6, 10))
        assert result == date(2025, 7, 5)

    async def test_monthly_december_wraps_year(self, hass, mock_config_entry, finance_store):
        """Test monthly: December wraps to January next year."""
        coord = self._make_coordinator(hass, mock_config_entry, finance_store)
        plan = RecurringPlan(id="p1", title="T", amount=1, frequency=FREQUENCY_MONTHLY, day=5)
        result = coord._calculate_next_date(plan, date(2025, 12, 10))
        assert result == date(2026, 1, 5)

    async def test_monthly_day_clamped_to_28(self, hass, mock_config_entry, finance_store):
        """Test monthly: day>28 is clamped to 28."""
        coord = self._make_coordinator(hass, mock_config_entry, finance_store)
        plan = RecurringPlan(id="p1", title="T", amount=1, frequency=FREQUENCY_MONTHLY, day=31)
        result = coord._calculate_next_date(plan, date(2025, 2, 1))
        assert result.day == 28  # Clamped

    async def test_yearly(self, hass, mock_config_entry, finance_store):
        """Test yearly: target month/day in the future."""
        coord = self._make_coordinator(hass, mock_config_entry, finance_store)
        plan = RecurringPlan(
            id="p1", title="T", amount=1, frequency=FREQUENCY_YEARLY, day=25, month=12
        )
        result = coord._calculate_next_date(plan, date(2025, 6, 1))
        assert result == date(2025, 12, 25)

    async def test_yearly_past_wraps_to_next_year(self, hass, mock_config_entry, finance_store):
        """Test yearly: target date already passed wraps to next year."""
        coord = self._make_coordinator(hass, mock_config_entry, finance_store)
        plan = RecurringPlan(
            id="p1", title="T", amount=1, frequency=FREQUENCY_YEARLY, day=1, month=1
        )
        result = coord._calculate_next_date(plan, date(2025, 6, 1))
        assert result == date(2026, 1, 1)

    async def test_unknown_frequency_returns_from_date(self, hass, mock_config_entry, finance_store):
        """Test unknown frequency falls through to return from_date."""
        coord = self._make_coordinator(hass, mock_config_entry, finance_store)
        plan = RecurringPlan(id="p1", title="T", amount=1, frequency="unknown", day=1)
        result = coord._calculate_next_date(plan, date(2025, 6, 15))
        assert result == date(2025, 6, 15)


class TestFinanceCoordinatorOperations:
    """Tests for FinanceCoordinator account operations."""

    async def _setup_coordinator(self, hass, mock_config_entry, finance_store, finance_data_with_account):
        """Create and set up a coordinator with a test account."""
        finance_store._data = finance_data_with_account
        finance_store._store.async_load = AsyncMock(return_value=finance_data_with_account.to_dict())

        coord = FinanceCoordinator(hass, mock_config_entry, finance_store, "test_account")
        # Manually set data to avoid full HA setup
        coord.data = finance_data_with_account
        return coord

    async def test_add_transaction(self, hass, mock_config_entry, finance_store, finance_data_with_account):
        """Test adding a transaction."""
        coord = await self._setup_coordinator(
            hass, mock_config_entry, finance_store, finance_data_with_account
        )
        events = []
        hass.bus.async_listen(EVENT_TRANSACTION_ADDED, lambda e: events.append(e))

        tx = await coord.async_add_transaction(1000.0, "Deposit")
        await hass.async_block_till_done()

        assert tx is not None
        assert tx.amount == 1000.0
        account = finance_data_with_account.get_account("test_account")
        assert account.balance == 6000.0  # 5000 + 1000
        assert len(events) >= 1

    async def test_adjust_balance(self, hass, mock_config_entry, finance_store, finance_data_with_account):
        """Test adjusting account balance."""
        coord = await self._setup_coordinator(
            hass, mock_config_entry, finance_store, finance_data_with_account
        )
        events = []
        hass.bus.async_listen(EVENT_BALANCE_ADJUSTED, lambda e: events.append(e))

        await coord.async_adjust_balance(3000.0)
        await hass.async_block_till_done()

        account = finance_data_with_account.get_account("test_account")
        assert account.balance == 3000.0
        # An adjustment transaction of -2000 should exist
        last_tx = account.last_transaction
        assert last_tx.amount == -2000.0
        assert last_tx.type == "adjustment"
        assert len(events) >= 1

    async def test_adjust_balance_no_change(self, hass, mock_config_entry, finance_store, finance_data_with_account):
        """Test adjusting balance to same value is a no-op."""
        coord = await self._setup_coordinator(
            hass, mock_config_entry, finance_store, finance_data_with_account
        )
        initial_tx_count = len(finance_data_with_account.get_account("test_account").transactions)

        await coord.async_adjust_balance(5000.0)  # Same as current

        account = finance_data_with_account.get_account("test_account")
        assert len(account.transactions) == initial_tx_count  # No new transaction

    async def test_low_balance_event(self, hass, mock_config_entry, finance_store, finance_data_with_account):
        """Test low balance event fires when balance drops below threshold."""
        coord = await self._setup_coordinator(
            hass, mock_config_entry, finance_store, finance_data_with_account
        )
        low_events = []
        hass.bus.async_listen(EVENT_LOW_BALANCE, lambda e: low_events.append(e))

        # Add large expense that drops balance below threshold (1000)
        await coord.async_add_transaction(-4500.0, "Big expense")
        await hass.async_block_till_done()

        account = finance_data_with_account.get_account("test_account")
        assert account.balance == 500.0  # Below 1000 threshold
        assert len(low_events) >= 1

    async def test_account_property(self, hass, mock_config_entry, finance_store, finance_data_with_account):
        """Test account property returns correct account."""
        coord = await self._setup_coordinator(
            hass, mock_config_entry, finance_store, finance_data_with_account
        )
        account = coord.account
        assert account is not None
        assert account.id == "test_account"

    async def test_account_property_none_when_no_data(self, hass, mock_config_entry, finance_store):
        """Test account property returns None when no data loaded."""
        coord = FinanceCoordinator(hass, mock_config_entry, finance_store, "test_account")
        assert coord.account is None
