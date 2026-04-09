"""Tests for ha_finance models."""
from __future__ import annotations

import pytest

from custom_components.ha_finance.models import (
    Account,
    FinanceData,
    RecurringPlan,
    Transaction,
)


class TestTransaction:
    """Tests for the Transaction model."""

    def test_create_auto_id_and_timestamp(self):
        """Test Transaction.create generates ID and timestamp."""
        tx = Transaction.create(amount=100.0, note="Test")
        assert tx.id.startswith("tx_")
        assert len(tx.id) == 11  # "tx_" + 8 hex chars
        assert tx.timestamp is not None
        assert tx.amount == 100.0
        assert tx.note == "Test"
        assert tx.type == "manual"

    def test_create_with_type_and_plan_id(self):
        """Test Transaction.create with custom type and plan_id."""
        tx = Transaction.create(
            amount=-50.0,
            note="Recurring",
            transaction_type="recurring",
            plan_id="plan_1",
        )
        assert tx.type == "recurring"
        assert tx.plan_id == "plan_1"
        assert tx.amount == -50.0

    def test_to_dict_and_from_dict_round_trip(self):
        """Test Transaction serialization round-trip."""
        tx = Transaction.create(amount=200.0, note="Round trip")
        data = tx.to_dict()
        restored = Transaction.from_dict(data)

        assert restored.id == tx.id
        assert restored.amount == 200.0
        assert restored.note == "Round trip"
        assert restored.timestamp == tx.timestamp
        assert restored.type == tx.type

    def test_from_dict_optional_plan_id(self):
        """Test from_dict with missing plan_id defaults to None."""
        data = {
            "id": "tx_abc",
            "amount": 50.0,
            "note": "",
            "timestamp": "2025-01-01T00:00:00",
            "type": "manual",
        }
        tx = Transaction.from_dict(data)
        assert tx.plan_id is None


class TestRecurringPlan:
    """Tests for the RecurringPlan model."""

    def test_to_dict_and_from_dict_round_trip(self):
        """Test RecurringPlan serialization round-trip."""
        plan = RecurringPlan(
            id="plan_1",
            title="Salary",
            amount=50000.0,
            frequency="monthly",
            day=25,
            month=1,
            active=True,
            last_executed="2025-06-25T00:00:00+00:00",
            next_date="2025-07-25",
        )
        data = plan.to_dict()
        restored = RecurringPlan.from_dict("plan_1", data)

        assert restored.id == "plan_1"
        assert restored.title == "Salary"
        assert restored.amount == 50000.0
        assert restored.frequency == "monthly"
        assert restored.day == 25
        assert restored.active is True

    def test_from_dict_defaults(self):
        """Test from_dict with minimal data uses defaults."""
        data = {"title": "Min", "amount": 100.0}
        plan = RecurringPlan.from_dict("plan_min", data)
        assert plan.frequency == "monthly"
        assert plan.day == 1
        assert plan.month == 1
        assert plan.active is True
        assert plan.last_executed is None
        assert plan.next_date is None


class TestAccount:
    """Tests for the Account model."""

    def test_add_transaction_updates_balance(self):
        """Test that adding a transaction updates the balance."""
        account = Account(id="acc1", name="Test", balance=500.0)
        tx = Transaction.create(amount=100.0, note="Income")
        account.add_transaction(tx)

        assert account.balance == 600.0
        assert len(account.transactions) == 1

    def test_add_transaction_negative_amount(self):
        """Test adding a negative transaction."""
        account = Account(id="acc1", name="Test", balance=500.0)
        tx = Transaction.create(amount=-200.0, note="Expense")
        account.add_transaction(tx)

        assert account.balance == 300.0

    def test_add_transaction_trims_oldest(self):
        """BUG: Transactions are silently trimmed when exceeding max."""
        account = Account(id="acc1", name="Test", balance=0.0)
        max_tx = 5  # Use small number for test

        for i in range(max_tx + 2):
            tx = Transaction.create(amount=1.0, note=f"tx_{i}")
            account.add_transaction(tx, max_transactions=max_tx)

        # Only max_tx transactions should remain
        assert len(account.transactions) == max_tx
        # Balance includes ALL transactions (7 * 1.0 = 7.0)
        assert account.balance == 7.0
        # Oldest transactions were silently dropped
        assert account.transactions[0].note == "tx_2"

    def test_last_transaction(self):
        """Test last_transaction property."""
        account = Account(id="acc1", name="Test")
        assert account.last_transaction is None

        tx = Transaction.create(amount=100.0, note="First")
        account.add_transaction(tx)
        assert account.last_transaction is not None
        assert account.last_transaction.note == "First"

    def test_add_and_remove_recurring_plan(self):
        """Test recurring plan lifecycle."""
        account = Account(id="acc1", name="Test")
        plan = RecurringPlan(
            id="plan_1", title="Rent", amount=-15000.0,
            frequency="monthly", day=1,
        )
        account.add_recurring_plan(plan)
        assert "plan_1" in account.recurring_plans

        account.remove_recurring_plan("plan_1")
        assert "plan_1" not in account.recurring_plans

    def test_remove_nonexistent_plan(self):
        """Test removing a plan that doesn't exist is a no-op."""
        account = Account(id="acc1", name="Test")
        account.remove_recurring_plan("nonexistent")  # Should not raise

    def test_to_dict_and_from_dict_round_trip(self):
        """Test Account serialization round-trip."""
        account = Account(
            id="acc1", name="Main", balance=1000.0, notes="Test notes"
        )
        tx = Transaction.create(amount=500.0, note="Deposit")
        account.add_transaction(tx)

        plan = RecurringPlan(
            id="plan_1", title="Rent", amount=-15000.0,
            frequency="monthly", day=1,
        )
        account.add_recurring_plan(plan)

        data = account.to_dict()
        restored = Account.from_dict("acc1", data)

        assert restored.name == "Main"
        assert restored.balance == 1500.0  # 1000 + 500 from add_transaction
        assert restored.notes == "Test notes"
        assert len(restored.transactions) == 1
        assert "plan_1" in restored.recurring_plans


class TestFinanceData:
    """Tests for the FinanceData root model."""

    def test_add_and_get_account(self):
        """Test adding and getting accounts."""
        data = FinanceData()
        account = Account(id="acc1", name="Main")
        data.add_account(account)

        found = data.get_account("acc1")
        assert found is not None
        assert found.name == "Main"

    def test_get_nonexistent_account(self):
        """Test getting nonexistent account returns None."""
        data = FinanceData()
        assert data.get_account("nonexistent") is None

    def test_remove_account(self):
        """Test removing an account."""
        data = FinanceData()
        data.add_account(Account(id="acc1", name="Main"))
        data.remove_account("acc1")
        assert data.get_account("acc1") is None

    def test_remove_nonexistent_account(self):
        """Test removing nonexistent account is a no-op."""
        data = FinanceData()
        data.remove_account("nonexistent")  # Should not raise

    def test_to_dict_and_from_dict_round_trip(self):
        """Test FinanceData serialization round-trip."""
        data = FinanceData()
        data.add_account(Account(id="acc1", name="Main", balance=5000))
        data.add_account(Account(id="acc2", name="Savings", balance=20000))

        serialized = data.to_dict()
        restored = FinanceData.from_dict(serialized)

        assert len(restored.accounts) == 2
        assert restored.get_account("acc1").balance == 5000
        assert restored.get_account("acc2").balance == 20000
