"""The asset Area's WebSocket commands guard what its services guard.

The service surface is not the only way in — the panel drives the same
operations over WebSocket, and any other client can too. Each guard the
services take, the commands take identically, so neither surface is the soft
way round the other: the ``force`` opt-in on ``delete_category`` (issue #49),
and the Category-must-exist check on ``create`` and ``update`` (issue #68).
The service side of both is covered in ``test_services.py``.
"""
from __future__ import annotations

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from custom_components.woow_ha_records.areas.asset.coordinator import AssetCoordinator
from custom_components.woow_ha_records.websocket import (
    async_register_websocket_commands,
)

CREATE_ASSET = "woow_ha_records/asset/create"
UPDATE_ASSET = "woow_ha_records/asset/update"
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


class TestCategoryMustExistOnCreate:
    """``create`` refuses a ``category_id`` naming no Category. Issue #68."""

    async def test_refuses_an_unknown_category(
        self, ws_client, coordinator: AssetCoordinator
    ) -> None:
        """The create is refused with ``not_found``, and no Asset is written."""
        await ws_client.send_json(
            {
                "id": 1,
                "type": CREATE_ASSET,
                "name": "Kettle",
                "category_id": "cat_deadbeef",
            }
        )
        response = await ws_client.receive_json()

        assert not response["success"]
        assert response["error"]["code"] == "not_found"
        assert dict(coordinator.assets) == {}

    async def test_still_accepts_an_uncategorised_asset(
        self, ws_client, coordinator: AssetCoordinator
    ) -> None:
        """The empty string is "no category", not a dangling reference."""
        await ws_client.send_json(
            {"id": 1, "type": CREATE_ASSET, "name": "Kettle", "category_id": ""}
        )
        response = await ws_client.receive_json()

        assert response["success"]
        assert response["result"]["asset"]["category_id"] == ""

    async def test_still_accepts_a_category_that_exists(
        self, ws_client, coordinator: AssetCoordinator
    ) -> None:
        """The check refuses dangling ids, not categorisation itself."""
        category = await coordinator.async_create_category("Appliances")

        await ws_client.send_json(
            {
                "id": 1,
                "type": CREATE_ASSET,
                "name": "Kettle",
                "category_id": category.id,
            }
        )
        response = await ws_client.receive_json()

        assert response["success"]
        assert response["result"]["asset"]["category_id"] == category.id


class TestCategoryMustExistOnUpdate:
    """``update`` refuses a ``category_id`` naming no Category. Issue #68."""

    async def test_refuses_an_unknown_category(
        self, ws_client, coordinator: AssetCoordinator
    ) -> None:
        """The move is refused with ``not_found``, and the Asset stays put."""
        category = await coordinator.async_create_category("Appliances")
        asset = await coordinator.async_create_asset_full(
            "Kettle", category_id=category.id
        )

        await ws_client.send_json(
            {
                "id": 1,
                "type": UPDATE_ASSET,
                "asset_id": asset.id,
                "category_id": "cat_deadbeef",
            }
        )
        response = await ws_client.receive_json()

        assert not response["success"]
        assert response["error"]["code"] == "not_found"
        assert coordinator.get_asset(asset.id).category_id == category.id

    async def test_the_refusal_writes_none_of_the_other_fields(
        self, ws_client, coordinator: AssetCoordinator
    ) -> None:
        """A refused call leaves the whole Asset untouched.

        The handler writes field by field as it walks the message, so the
        Category has to be checked before the first write — otherwise a
        refusal would still have renamed the Asset it refused to move.
        """
        asset = await coordinator.async_create_asset_full("Kettle", brand="Bosch")

        await ws_client.send_json(
            {
                "id": 1,
                "type": UPDATE_ASSET,
                "asset_id": asset.id,
                "name": "Toaster",
                "brand": "Philips",
                "category_id": "cat_deadbeef",
            }
        )
        response = await ws_client.receive_json()

        assert response["error"]["code"] == "not_found"
        unchanged = coordinator.get_asset(asset.id)
        assert unchanged.name == "Kettle"
        assert unchanged.brand == "Bosch"
        assert unchanged.category_id == ""

    async def test_still_accepts_clearing_the_category(
        self, ws_client, coordinator: AssetCoordinator
    ) -> None:
        """Moving an Asset out of every Category stays a legitimate edit."""
        category = await coordinator.async_create_category("Appliances")
        asset = await coordinator.async_create_asset_full(
            "Kettle", category_id=category.id
        )

        await ws_client.send_json(
            {
                "id": 1,
                "type": UPDATE_ASSET,
                "asset_id": asset.id,
                "category_id": "",
            }
        )
        response = await ws_client.receive_json()

        assert response["success"]
        assert response["result"]["asset"]["category_id"] == ""

    async def test_still_accepts_a_move_to_a_category_that_exists(
        self, ws_client, coordinator: AssetCoordinator
    ) -> None:
        """The check refuses dangling ids, not moving itself."""
        source = await coordinator.async_create_category("Appliances")
        destination = await coordinator.async_create_category("Kitchen")
        asset = await coordinator.async_create_asset_full(
            "Kettle", category_id=source.id
        )

        await ws_client.send_json(
            {
                "id": 1,
                "type": UPDATE_ASSET,
                "asset_id": asset.id,
                "category_id": destination.id,
            }
        )
        response = await ws_client.receive_json()

        assert response["success"]
        assert response["result"]["asset"]["category_id"] == destination.id
