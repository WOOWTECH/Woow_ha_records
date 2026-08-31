"""The asset Area's ``delete_category`` command guards its cascade too.

The service surface is not the only unguarded way in — the panel drives the
same deletion over WebSocket, and any other client can too. Both surfaces take
the same ``force`` opt-in so neither is the soft way round the other.
Issue #49; the service side is covered in ``test_services.py``.
"""
from __future__ import annotations

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from custom_components.woow_ha_records.areas.asset.coordinator import AssetCoordinator
from custom_components.woow_ha_records.websocket import (
    async_register_websocket_commands,
)

DELETE_CATEGORY = "woow_ha_records/asset/delete_category"


@pytest.fixture
async def ws_client(
    hass: HomeAssistant, asset_runtime: AssetCoordinator, hass_ws_client
):
    """A connected client with the asset commands registered.

    ``asset_runtime`` supplies the ``hass.data`` record the commands read;
    this adds the registration, which is the half the two surfaces do
    differently.
    """
    assert await async_setup_component(hass, "websocket_api", {})
    async_register_websocket_commands(hass)
    return await hass_ws_client(hass)


class TestDeleteCategoryGuard:
    """A Category holding Assets is deleted only on an explicit opt-in."""

    async def test_refuses_a_category_that_still_holds_assets(
        self, ws_client, coordinator: AssetCoordinator, category_holding_assets
    ) -> None:
        """The default call is refused, and nothing is deleted."""
        category_id = (await category_holding_assets(3)).id

        await ws_client.send_json(
            {"id": 1, "type": DELETE_CATEGORY, "category_id": category_id}
        )
        response = await ws_client.receive_json()

        assert not response["success"]
        assert response["error"]["code"] == "not_empty"
        assert coordinator.get_category(category_id) is not None
        assert len(coordinator.get_assets_by_category(category_id)) == 3

    async def test_the_refusal_counts_what_it_refused_to_destroy(
        self, ws_client, coordinator: AssetCoordinator, category_holding_assets
    ) -> None:
        """The count is the whole point of the guard, so it must be said."""
        category_id = (await category_holding_assets(2)).id

        await ws_client.send_json(
            {"id": 1, "type": DELETE_CATEGORY, "category_id": category_id}
        )
        response = await ws_client.receive_json()

        assert "2" in response["error"]["message"]

    async def test_force_cascade_deletes_the_assets(
        self, ws_client, coordinator: AssetCoordinator, category_holding_assets
    ) -> None:
        """``force: true`` is the behaviour the panel has always had."""
        category_id = (await category_holding_assets(3)).id

        await ws_client.send_json(
            {
                "id": 1,
                "type": DELETE_CATEGORY,
                "category_id": category_id,
                "force": True,
            }
        )
        response = await ws_client.receive_json()

        assert response["success"]
        assert response["result"] == {"success": True}
        assert coordinator.get_category(category_id) is None
        assert dict(coordinator.assets) == {}

    async def test_an_empty_category_needs_no_force(
        self, ws_client, coordinator: AssetCoordinator
    ) -> None:
        """The guard is about the cascade, not about deleting at all."""
        category = await coordinator.async_create_category("Empty")

        await ws_client.send_json(
            {"id": 1, "type": DELETE_CATEGORY, "category_id": category.id}
        )
        response = await ws_client.receive_json()

        assert response["success"]
        assert coordinator.get_category(category.id) is None

    async def test_force_false_is_read_as_no_opt_in(
        self, ws_client, coordinator: AssetCoordinator, category_holding_assets
    ) -> None:
        """Sending the flag off is the same as not sending it."""
        category_id = (await category_holding_assets(1)).id

        await ws_client.send_json(
            {
                "id": 1,
                "type": DELETE_CATEGORY,
                "category_id": category_id,
                "force": False,
            }
        )
        response = await ws_client.receive_json()

        assert response["error"]["code"] == "not_empty"
        assert len(coordinator.assets) == 1

    async def test_a_missing_category_is_still_reported_as_missing(
        self, ws_client, coordinator: AssetCoordinator
    ) -> None:
        """The guard runs after the existence check, not instead of it.

        ``cat_deadbeef`` is well-formed on purpose: the command's schema
        rejects anything that does not match ``^cat_[a-f0-9]+$`` before the
        handler runs, so a nonsense id would prove nothing about the handler.
        """
        await ws_client.send_json(
            {
                "id": 1,
                "type": DELETE_CATEGORY,
                "category_id": "cat_deadbeef",
                "force": True,
            }
        )
        response = await ws_client.receive_json()

        assert response["error"]["code"] == "not_found"
