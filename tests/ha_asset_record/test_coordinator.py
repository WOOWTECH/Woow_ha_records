"""Tests for ha_asset_record coordinator."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from types import MappingProxyType
from unittest.mock import AsyncMock

import pytest

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from custom_components.ha_asset_record.const import (
    FIELD_BRAND,
    FIELD_CATEGORY,
    FIELD_MAINTENANCE_MD,
    FIELD_MANUAL_MD,
    FIELD_NAME,
    FIELD_PURCHASE_AT,
    FIELD_VALUE,
    FIELD_WARRANTY_UNTIL,
)
from custom_components.ha_asset_record.coordinator import Asset, AssetCoordinator


class TestAsset:
    """Tests for the Asset dataclass."""

    def test_to_dict_and_from_dict_round_trip(self):
        """Test Asset serialization round-trip."""
        now = dt_util.utcnow()
        asset = Asset(
            id="asset_abc123",
            name="TV",
            brand="Sony",
            category="Electronics",
            value=1299.99,
            purchase_at=now,
            warranty_until=now,
            manual_md="# Manual",
            maintenance_md="# Maintenance",
            created_at=now,
            updated_at=now,
        )
        data = asset.to_dict()
        restored = Asset.from_dict(data)

        assert restored.id == "asset_abc123"
        assert restored.name == "TV"
        assert restored.brand == "Sony"
        assert restored.value == 1299.99
        assert restored.purchase_at is not None
        assert restored.warranty_until is not None

    def test_from_dict_defaults(self):
        """Test Asset.from_dict with minimal data."""
        data = {"id": "asset_min", "name": "Minimal"}
        asset = Asset.from_dict(data)
        assert asset.brand == ""
        assert asset.value == 0
        assert asset.purchase_at is None

    def test_from_dict_corrupt_value(self):
        """Test Asset.from_dict handles invalid value field."""
        data = {"id": "asset_bad", "name": "Bad", "value": "not_a_number"}
        asset = Asset.from_dict(data)
        assert asset.value == 0  # Defaults to 0 on parse failure


class TestAssetCoordinator:
    """Tests for AssetCoordinator."""

    async def test_create_asset_generates_uuid(self, coordinator):
        """Test that created assets get proper UUID format."""
        asset = await coordinator.async_create_asset("TV")
        assert re.match(r"^asset_[a-f0-9]{32}$", asset.id)
        assert asset.name == "TV"
        coordinator._store.async_save.assert_called()

    async def test_create_asset_full_single_save(self, coordinator):
        """Test async_create_asset_full triggers only one save."""
        coordinator._store.async_save.reset_mock()

        purchase = datetime(2025, 6, 1, tzinfo=timezone.utc)
        warranty = datetime(2027, 6, 1, tzinfo=timezone.utc)

        asset = await coordinator.async_create_asset_full(
            name="Laptop",
            brand="Dell",
            category="Electronics",
            value=2500.0,
            purchase_at=purchase,
            warranty_until=warranty,
            manual_md="# Manual",
            maintenance_md="# Maintenance",
        )

        assert asset.name == "Laptop"
        assert asset.brand == "Dell"
        assert asset.value == 2500.0
        assert asset.purchase_at is not None
        # Only one save call
        assert coordinator._store.async_save.call_count == 1

    async def test_delete_asset(self, hass, coordinator):
        """Test deleting an asset removes it from dict."""
        asset = await coordinator.async_create_asset("To Delete")
        assert asset.id in coordinator._assets

        result = await coordinator.async_delete_asset(asset.id)
        assert result is True
        assert asset.id not in coordinator._assets

    async def test_delete_asset_not_found(self, coordinator):
        """Test deleting nonexistent asset returns False."""
        result = await coordinator.async_delete_asset("asset_nonexistent")
        assert result is False

    async def test_update_asset_field_validation_rejects_unknown_field(self, coordinator):
        """Test update rejects unknown fields."""
        asset = await coordinator.async_create_asset("Test")
        result = await coordinator.async_update_asset(asset.id, "unknown_field", "val")
        assert result is False

    async def test_update_asset_field_validation_rejects_wrong_type(self, coordinator):
        """Test update rejects wrong value types."""
        asset = await coordinator.async_create_asset("Test")
        result = await coordinator.async_update_asset(asset.id, FIELD_VALUE, "not_a_number")
        assert result is False

    async def test_update_asset_string_field(self, coordinator):
        """Test updating a string field."""
        asset = await coordinator.async_create_asset("Test")
        result = await coordinator.async_update_asset(asset.id, FIELD_BRAND, "Sony")
        assert result is True
        assert coordinator._assets[asset.id].brand == "Sony"

    async def test_update_asset_value_field(self, coordinator):
        """Test updating the value field."""
        asset = await coordinator.async_create_asset("Test")
        result = await coordinator.async_update_asset(asset.id, FIELD_VALUE, 999.99)
        assert result is True
        assert coordinator._assets[asset.id].value == 999.99

    async def test_update_asset_datetime_fields_utc(self, coordinator):
        """Test datetime fields are stored as UTC."""
        asset = await coordinator.async_create_asset("Test")
        purchase = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)

        result = await coordinator.async_update_asset(
            asset.id, FIELD_PURCHASE_AT, purchase
        )
        assert result is True
        assert coordinator._assets[asset.id].purchase_at is not None
        assert coordinator._assets[asset.id].purchase_at.tzinfo is not None

    async def test_update_asset_datetime_none(self, coordinator):
        """Test setting datetime field to None."""
        asset = await coordinator.async_create_asset("Test")
        result = await coordinator.async_update_asset(
            asset.id, FIELD_PURCHASE_AT, None
        )
        assert result is True
        assert coordinator._assets[asset.id].purchase_at is None

    async def test_async_load_corrupt_asset_skipped(self, coordinator):
        """Test that corrupt assets are skipped during load."""
        data = {
            "assets": [
                {"id": "asset_good", "name": "Good Asset", "value": 100},
                {"bad": "data"},  # Missing 'id' key
                {"id": "asset_good2", "name": "Good Asset 2"},
            ],
        }
        coordinator._store.async_load = AsyncMock(return_value=data)
        await coordinator.async_load()

        # Only valid assets should be loaded
        assert "asset_good" in coordinator._assets
        assert "asset_good2" in coordinator._assets

    async def test_assets_returns_mapping_proxy(self, coordinator):
        """Test assets property returns read-only mapping."""
        await coordinator.async_create_asset("Test")
        assets = coordinator.assets
        assert isinstance(assets, MappingProxyType)

    async def test_listener_add_fire_remove(self, coordinator):
        """Test listener lifecycle."""
        calls = []
        remove = coordinator.add_listener(lambda: calls.append(1))

        await coordinator.async_create_asset("Trigger")
        assert len(calls) == 1

        remove()
        await coordinator.async_create_asset("No trigger")
        assert len(calls) == 1  # No new call

    async def test_get_asset(self, coordinator):
        """Test getting asset by ID."""
        asset = await coordinator.async_create_asset("Test")
        found = coordinator.get_asset(asset.id)
        assert found is not None
        assert found.name == "Test"

        not_found = coordinator.get_asset("nonexistent")
        assert not_found is None
