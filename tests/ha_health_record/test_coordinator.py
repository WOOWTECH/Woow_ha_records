"""Tests for ha_health_record coordinator."""
from __future__ import annotations

import math
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from custom_components.ha_health_record.coordinator import (
    MAX_RECORDS,
    HealthRecordCoordinator,
    Record,
    RecordSet,
)


class TestRecord:
    """Tests for the Record dataclass."""

    def test_to_dict_and_from_dict_round_trip(self):
        """Test Record serialization round-trip."""
        ts = datetime(2025, 6, 15, 10, 30, 0, tzinfo=timezone.utc)
        record = Record(value=240.5, note="morning feed", timestamp=ts)

        data = record.to_dict()
        restored = Record.from_dict(data)

        assert restored.value == 240.5
        assert restored.note == "morning feed"
        assert restored.timestamp is not None
        assert restored.timestamp.year == 2025

    def test_from_dict_legacy_amount_key(self):
        """Test Record.from_dict handles legacy 'amount' key."""
        data = {
            "amount": 180.0,
            "note": "legacy record",
            "timestamp": "2025-01-10T08:00:00+00:00",
        }
        record = Record.from_dict(data)
        assert record.value == 180.0
        assert record.note == "legacy record"

    def test_from_dict_value_takes_priority_over_amount(self):
        """Test that 'value' is preferred over 'amount'."""
        data = {"value": 200.0, "amount": 100.0, "note": "", "timestamp": None}
        record = Record.from_dict(data)
        assert record.value == 200.0

    def test_from_dict_empty(self):
        """Test Record.from_dict with minimal data."""
        record = Record.from_dict({})
        assert record.value is None
        assert record.note == ""
        assert record.timestamp is None


class TestRecordSet:
    """Tests for the RecordSet dataclass."""

    def test_to_dict(self):
        """Test RecordSet serialization."""
        rs = RecordSet(
            type_id="feeding",
            name="Feeding",
            unit="ml",
            current_value=240.0,
            current_note="test",
        )
        data = rs.to_dict()
        assert data["current_value"] == 240.0
        assert data["current_note"] == "test"
        assert "last_record" in data

    def test_load_from_dict(self):
        """Test RecordSet state loading."""
        rs = RecordSet(type_id="feeding", name="Feeding", unit="ml")
        rs.load_from_dict({
            "current_value": 300.0,
            "current_note": "big feed",
            "last_record": {
                "value": 300.0,
                "note": "big feed",
                "timestamp": "2025-06-15T12:00:00+00:00",
            },
        })
        assert rs.current_value == 300.0
        assert rs.current_note == "big feed"
        assert rs.last_record.value == 300.0

    def test_load_from_dict_legacy_current_amount(self):
        """Test loading with legacy 'current_amount' key."""
        rs = RecordSet(type_id="feeding", name="Feeding", unit="ml")
        rs.load_from_dict({"current_amount": 150.0})
        assert rs.current_value == 150.0


class TestHealthRecordCoordinator:
    """Tests for HealthRecordCoordinator."""

    async def test_init_creates_record_sets(self, coordinator):
        """Test coordinator initializes record_sets from config."""
        assert "feeding" in coordinator.record_sets
        assert "sleep" in coordinator.record_sets
        assert "weight" in coordinator.record_sets
        assert coordinator.record_sets["feeding"].name == "Feeding"
        assert coordinator.record_sets["feeding"].unit == "ml"

    async def test_async_load_empty_storage(self, coordinator):
        """Test loading with empty storage."""
        coordinator._store.async_load = AsyncMock(return_value=None)
        await coordinator.async_load()
        assert len(coordinator.records) == 0

    async def test_async_load_v2_data(self, coordinator):
        """Test loading v2 format data."""
        v2_data = {
            "record_sets": {
                "feeding": {
                    "current_value": 200.0,
                    "current_note": "loaded",
                    "last_record": {
                        "value": 200.0,
                        "note": "loaded",
                        "timestamp": "2025-06-15T10:00:00+00:00",
                    },
                },
            },
            "records": [
                {
                    "id": "abc123",
                    "record_type": "feeding",
                    "record_name": "Feeding",
                    "value": 200.0,
                    "unit": "ml",
                    "note": "loaded",
                    "timestamp": "2025-06-15T10:00:00+00:00",
                },
            ],
        }
        coordinator._store.async_load = AsyncMock(return_value=v2_data)
        await coordinator.async_load()

        assert coordinator.record_sets["feeding"].current_value == 200.0
        assert coordinator.record_sets["feeding"].current_note == "loaded"
        assert len(coordinator.records) == 1

    async def test_migrate_v1_to_v2(self, coordinator):
        """Test v1 to v2 data migration."""
        v1_data = {
            "activity_sets": {
                "feeding": {
                    "current_amount": 180.0,
                    "current_note": "feed note",
                    "last_record": {
                        "amount": 180.0,
                        "note": "feed note",
                        "timestamp": "2025-01-10T08:00:00",
                    },
                },
            },
            "growth_sets": {
                "weight": {
                    "current_value": 3.5,
                    "current_note": "",
                    "last_record": {
                        "value": 3.5,
                        "note": "",
                        "timestamp": "2025-01-10T09:00:00",
                    },
                },
            },
            "activity_records": [
                {
                    "id": "rec1",
                    "activity_type": "feeding",
                    "activity_name": "Feeding",
                    "amount": 180.0,
                    "unit": "ml",
                    "note": "feed note",
                    "timestamp": "2025-01-10T08:00:00",
                },
            ],
            "growth_records": [
                {
                    "id": "rec2",
                    "growth_type": "weight",
                    "growth_name": "Weight",
                    "value": 3.5,
                    "unit": "kg",
                    "note": "",
                    "timestamp": "2025-01-10T09:00:00",
                },
            ],
        }

        migrated = HealthRecordCoordinator._migrate_v1_to_v2(v1_data)

        # Check record_sets migration
        assert "feeding" in migrated["record_sets"]
        assert migrated["record_sets"]["feeding"]["current_value"] == 180.0
        assert "weight" in migrated["record_sets"]
        assert migrated["record_sets"]["weight"]["current_value"] == 3.5

        # Check records migration
        assert len(migrated["records"]) == 2
        feeding_rec = next(r for r in migrated["records"] if r["record_type"] == "feeding")
        assert feeding_rec["value"] == 180.0
        weight_rec = next(r for r in migrated["records"] if r["record_type"] == "weight")
        assert weight_rec["value"] == 3.5

        # Records should be sorted by timestamp
        timestamps = [r["timestamp"] for r in migrated["records"]]
        assert timestamps == sorted(timestamps)

    async def test_log_record_basic(self, coordinator):
        """Test basic record logging."""
        coordinator.set_record_value("feeding", 250.0)
        coordinator.set_record_note("feeding", "test note")

        record = coordinator.log_record("feeding")

        assert record is not None
        assert record.value == 250.0
        assert record.note == "test note"
        assert record.timestamp is not None
        assert len(coordinator.records) == 1
        assert coordinator.records[0]["value"] == 250.0
        assert coordinator.records[0]["record_type"] == "feeding"

        # last_record should be updated
        rs = coordinator.record_sets["feeding"]
        assert rs.last_record.value == 250.0

    async def test_log_record_custom_timestamp(self, coordinator):
        """Test logging with a custom timestamp."""
        custom_ts = datetime(2025, 3, 15, 14, 0, 0, tzinfo=timezone.utc)
        coordinator.set_record_value("feeding", 100.0)
        record = coordinator.log_record("feeding", timestamp=custom_ts)

        assert record is not None
        assert record.timestamp == custom_ts
        assert coordinator.records[0]["timestamp"] == custom_ts.isoformat()

    async def test_log_record_invalid_type_returns_none(self, coordinator):
        """Test logging with nonexistent type returns None."""
        record = coordinator.log_record("nonexistent_type")
        assert record is None

    async def test_prune_records_at_max(self, coordinator):
        """Test that records are pruned when exceeding MAX_RECORDS."""
        # Pre-fill with MAX_RECORDS entries
        for i in range(MAX_RECORDS):
            coordinator.records.append({
                "id": f"rec_{i}",
                "record_type": "feeding",
                "record_name": "Feeding",
                "value": float(i),
                "unit": "ml",
                "note": "",
                "timestamp": f"2025-01-01T{i % 24:02d}:00:00+00:00",
            })

        assert len(coordinator.records) == MAX_RECORDS

        # Log one more record - should trigger pruning
        coordinator.set_record_value("feeding", 999.0)
        coordinator.log_record("feeding")

        assert len(coordinator.records) == MAX_RECORDS
        # The oldest record should have been removed
        assert coordinator.records[0]["id"] == "rec_1"  # rec_0 was pruned
        # The new record should be the last one
        assert coordinator.records[-1]["value"] == 999.0

    async def test_delete_record_by_uuid(self, coordinator):
        """Test deleting a record by UUID."""
        coordinator.set_record_value("feeding", 200.0)
        coordinator.log_record("feeding")
        record_id = coordinator.records[0]["id"]

        result = coordinator.delete_record("feeding", "ignored", record_id=record_id)
        assert result is True
        assert len(coordinator.records) == 0

    async def test_delete_record_by_type_timestamp_fallback(self, coordinator):
        """Test deleting a record by type+timestamp when no UUID provided."""
        coordinator.set_record_value("feeding", 200.0)
        coordinator.log_record("feeding")
        timestamp = coordinator.records[0]["timestamp"]

        result = coordinator.delete_record("feeding", timestamp)
        assert result is True
        assert len(coordinator.records) == 0

    async def test_delete_record_not_found(self, coordinator):
        """Test deleting a nonexistent record returns False."""
        result = coordinator.delete_record("feeding", "2025-01-01T00:00:00")
        assert result is False

    async def test_update_record(self, coordinator):
        """Test updating a record's fields."""
        coordinator.set_record_value("feeding", 200.0)
        coordinator.set_record_note("feeding", "original")
        coordinator.log_record("feeding")
        record_id = coordinator.records[0]["id"]
        timestamp = coordinator.records[0]["timestamp"]

        result = coordinator.update_record(
            "feeding",
            timestamp,
            value=300.0,
            note="updated",
            new_timestamp="2025-12-25T12:00:00+00:00",
            record_id=record_id,
        )
        assert result is True
        assert coordinator.records[0]["value"] == 300.0
        assert coordinator.records[0]["note"] == "updated"
        assert coordinator.records[0]["timestamp"] == "2025-12-25T12:00:00+00:00"

    async def test_update_record_not_found(self, coordinator):
        """Test updating a nonexistent record returns False."""
        result = coordinator.update_record("feeding", "2025-01-01T00:00:00", value=100)
        assert result is False

    async def test_get_records_in_range(self, coordinator):
        """Test querying records within a date range."""
        # Add records at different times
        for i, hour in enumerate([8, 12, 18]):
            coordinator.records.append({
                "id": f"rec_{i}",
                "record_type": "feeding",
                "record_name": "Feeding",
                "value": float(100 + i * 50),
                "unit": "ml",
                "note": "",
                "timestamp": f"2025-06-15T{hour:02d}:00:00+00:00",
            })

        start = datetime(2025, 6, 15, 10, 0, 0, tzinfo=timezone.utc)
        end = datetime(2025, 6, 15, 15, 0, 0, tzinfo=timezone.utc)

        results = coordinator.get_records_in_range(start, end)

        # Only the 12:00 record should be in range
        assert len(results) == 1
        assert results[0]["value"] == 150.0

    async def test_set_record_value(self, coordinator):
        """Test setting record value."""
        coordinator.set_record_value("feeding", 500.0)
        assert coordinator.record_sets["feeding"].current_value == 500.0

    async def test_set_record_value_nonexistent_type(self, coordinator):
        """Test setting value for nonexistent type is a no-op."""
        coordinator.set_record_value("nonexistent", 100.0)
        # Should not raise

    async def test_set_record_note(self, coordinator):
        """Test setting record note."""
        coordinator.set_record_note("feeding", "test note")
        assert coordinator.record_sets["feeding"].current_note == "test note"

    async def test_get_record_set(self, coordinator):
        """Test getting a record set."""
        rs = coordinator.get_record_set("feeding")
        assert rs is not None
        assert rs.name == "Feeding"

        none_rs = coordinator.get_record_set("nonexistent")
        assert none_rs is None

    async def test_recalculate_current_value_after_delete(self, coordinator):
        """Test that current_value is recalculated after deleting the latest record."""
        # Log two records
        coordinator.set_record_value("feeding", 100.0)
        coordinator.log_record(
            "feeding",
            timestamp=datetime(2025, 1, 1, 8, 0, 0, tzinfo=timezone.utc),
        )
        coordinator.set_record_value("feeding", 200.0)
        coordinator.log_record(
            "feeding",
            timestamp=datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
        )

        # Delete the latest record (200)
        latest_id = coordinator.records[-1]["id"]
        coordinator.delete_record("feeding", "ignored", record_id=latest_id)

        # current_value should be recalculated to 100
        assert coordinator.record_sets["feeding"].current_value == 100.0

    async def test_log_record_nan_value_bug(self, coordinator):
        """BUG: NaN can be set as current_value and logged via button.

        The set_record_value method does not validate for NaN/Infinity.
        This test demonstrates the issue that Fix 4.1 addresses.
        """
        coordinator.set_record_value("feeding", float("nan"))
        record = coordinator.log_record("feeding")

        assert record is not None
        # BUG: NaN is stored in the record
        assert math.isnan(record.value)
        assert math.isnan(coordinator.records[0]["value"])

    async def test_log_record_infinity_value_bug(self, coordinator):
        """BUG: Infinity can be set as current_value and logged."""
        coordinator.set_record_value("feeding", float("inf"))
        record = coordinator.log_record("feeding")

        assert record is not None
        assert math.isinf(record.value)

    async def test_device_info(self, coordinator):
        """Test device info generation."""
        info = coordinator.get_device_info()
        assert ("ha_health_record", "test_member") in info["identifiers"]
        assert info["name"] == "Test Member"

    async def test_v1_fallback_in_options(self, hass):
        """Test coordinator falls back to v1 format in options."""
        from types import MappingProxyType
        from homeassistant.config_entries import ConfigEntry
        from custom_components.ha_health_record.const import DOMAIN, CONF_MEMBER_ID, CONF_MEMBER_NAME

        entry = ConfigEntry(
            version=2,
            minor_version=1,
            domain=DOMAIN,
            title="Legacy",
            data={CONF_MEMBER_ID: "legacy", CONF_MEMBER_NAME: "Legacy"},
            source="user",
            options={
                "activity_sets": [
                    {"activity_type": "feeding", "activity_name": "Feeding", "activity_unit": "ml"},
                ],
                "growth_sets": [
                    {"growth_type": "weight", "growth_name": "Weight", "growth_unit": "kg"},
                ],
            },
            unique_id="legacy",
            discovery_keys=MappingProxyType({}),
        )
        entry.hass = hass

        coord = HealthRecordCoordinator(hass, entry)
        assert "feeding" in coord.record_sets
        assert "weight" in coord.record_sets
