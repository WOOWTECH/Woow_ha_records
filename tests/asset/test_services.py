"""Tests for the asset Area's service handlers."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError

from custom_components.woow_ha_records.areas.asset.coordinator import AssetCoordinator
from custom_components.woow_ha_records.areas.asset.services import _parse_datetime
from custom_components.woow_ha_records.const import DOMAIN
from custom_components.woow_ha_records.services import async_register_services

CREATE_ASSET = "asset_create_asset"
UPDATE_ASSET = "asset_update_asset"
DELETE_CATEGORY = "asset_delete_category"

STRINGS = (
    Path(__file__).parent.parent.parent
    / "custom_components"
    / "woow_ha_records"
    / "strings.json"
)


class TestParseDatetime:
    """``_parse_datetime`` parses, normalises, and reports by field name."""

    def test_returns_none_for_an_absent_value(self) -> None:
        """An omitted optional datetime is not an error."""
        assert _parse_datetime(None, "purchase_at") is None
        assert _parse_datetime("", "purchase_at") is None

    def test_assumes_utc_for_a_naive_datetime(self) -> None:
        """Naive input is read as UTC, never as local time."""
        parsed = _parse_datetime("2026-08-27T09:30:00", "purchase_at")

        assert parsed is not None
        assert parsed.tzinfo is not None
        assert parsed.utcoffset().total_seconds() == 0

    def test_names_the_field_that_failed(self) -> None:
        """The error says which field held the unparseable value.

        Both placeholders matter to the user: ``value`` alone leaves them
        guessing which of ``purchase_at`` and ``warranty_until`` they got
        wrong, and — because Home Assistant drops the whole ``.format()``
        call when one placeholder is missing — omitting ``field`` would show
        them the raw template instead of a message. Issue #27.
        """
        with pytest.raises(ServiceValidationError) as caught:
            _parse_datetime("not-a-date", "warranty_until")

        assert caught.value.translation_key == "asset.invalid_datetime"
        assert caught.value.translation_placeholders == {
            "field": "warranty_until",
            "value": "not-a-date",
        }

    def test_renders_a_message_with_nothing_left_unfilled(self) -> None:
        """The placeholders raised actually fill in the published message."""
        exceptions = json.loads(STRINGS.read_text(encoding="utf-8"))["exceptions"]
        message = exceptions["asset"]["invalid_datetime"]["message"]

        with pytest.raises(ServiceValidationError) as caught:
            _parse_datetime("not-a-date", "purchase_at")

        rendered = message.format(**caught.value.translation_placeholders)
        assert "{" not in rendered
        assert "purchase_at" in rendered


# ---------------------------------------------------------------------------
# ``asset_delete_category`` will not cascade unless the caller says so
# ---------------------------------------------------------------------------
#
# Deleting a Category destroys every Asset filed under it. The asset panel
# guards that — it names the Category and counts its Assets before asking —
# but the service and WebSocket surfaces guarded nothing, and
# ``services.yaml`` points AI assistants straight at the service. Issue #49,
# mirroring what #45 did for the note Area.
#
# Asset is the milder of the two: an Asset *can* be moved out of a Category
# first, so a user has an escape route a Note never had. That ranks it below
# note; it does not excuse an unguarded API.


@pytest.fixture
def asset_services(
    hass: HomeAssistant, asset_runtime: AssetCoordinator
) -> AssetCoordinator:
    """Register the services against a coordinator the handlers can reach.

    ``asset_runtime`` supplies the ``hass.data`` record the handlers read;
    this adds the registration, which is the half the two surfaces do
    differently.
    """
    async_register_services(hass)
    return asset_runtime


class TestDeleteCategoryGuard:
    """A Category holding Assets is deleted only on an explicit opt-in."""

    async def test_refuses_a_category_that_still_holds_assets(
        self,
        hass: HomeAssistant,
        asset_services: AssetCoordinator,
        category_holding_assets,
    ) -> None:
        """The default call is refused, and nothing is deleted."""
        category_id = (await category_holding_assets(3)).id

        with pytest.raises(ServiceValidationError) as caught:
            await hass.services.async_call(
                DOMAIN,
                DELETE_CATEGORY,
                {"category_id": category_id},
                blocking=True,
            )

        assert caught.value.translation_key == "asset.category_not_empty"
        assert asset_services.get_category(category_id) is not None
        assert len(asset_services.get_assets_by_category(category_id)) == 3

    async def test_refusal_names_the_category_and_counts_its_assets(
        self,
        hass: HomeAssistant,
        asset_services: AssetCoordinator,
        category_holding_assets,
    ) -> None:
        """The caller is told what they would have destroyed.

        A bare "refused" leaves an assistant no way to judge whether the
        opt-in is warranted. The count is the whole point of the guard.
        """
        category = await category_holding_assets(2)

        with pytest.raises(ServiceValidationError) as caught:
            await hass.services.async_call(
                DOMAIN,
                DELETE_CATEGORY,
                {"category_id": category.id},
                blocking=True,
            )

        assert caught.value.translation_placeholders == {
            "name": category.name,
            "asset_count": "2",
        }

    async def test_renders_a_message_with_nothing_left_unfilled(
        self,
        hass: HomeAssistant,
        asset_services: AssetCoordinator,
        category_holding_assets,
    ) -> None:
        """The placeholders raised actually fill the published message.

        Home Assistant drops the whole ``.format()`` call when one
        placeholder is missing, showing the raw template instead. Issue #27.
        """
        message = json.loads(STRINGS.read_text(encoding="utf-8"))["exceptions"][
            "asset"
        ]["category_not_empty"]["message"]
        category = await category_holding_assets(1)

        with pytest.raises(ServiceValidationError) as caught:
            await hass.services.async_call(
                DOMAIN,
                DELETE_CATEGORY,
                {"category_id": category.id},
                blocking=True,
            )

        rendered = message.format(**caught.value.translation_placeholders)
        assert "{" not in rendered
        assert category.name in rendered

    async def test_force_cascade_deletes_the_assets(
        self,
        hass: HomeAssistant,
        asset_services: AssetCoordinator,
        category_holding_assets,
    ) -> None:
        """``force: true`` is the behaviour the panel has always had."""
        category_id = (await category_holding_assets(3)).id

        result = await hass.services.async_call(
            DOMAIN,
            DELETE_CATEGORY,
            {"category_id": category_id, "force": True},
            blocking=True,
            return_response=True,
        )

        assert result == {"success": True}
        assert asset_services.get_category(category_id) is None
        assert dict(asset_services.assets) == {}

    async def test_an_empty_category_needs_no_force(
        self, hass: HomeAssistant, asset_services: AssetCoordinator
    ) -> None:
        """The guard is about the cascade, not about deleting at all."""
        category = await asset_services.async_create_category("Empty")

        result = await hass.services.async_call(
            DOMAIN,
            DELETE_CATEGORY,
            {"category_id": category.id},
            blocking=True,
            return_response=True,
        )

        assert result == {"success": True}
        assert asset_services.get_category(category.id) is None

    async def test_an_asset_in_another_category_does_not_hold_the_delete(
        self, hass: HomeAssistant, asset_services: AssetCoordinator
    ) -> None:
        """The count is scoped to the Category being deleted.

        The asset Area keeps one flat store of Assets rather than a list per
        Category, so a guard that counted the store instead of the Category
        would refuse every deletion once any Asset existed anywhere.
        """
        elsewhere = await asset_services.async_create_category("Elsewhere")
        await asset_services.async_create_asset_full(
            "Kettle", category_id=elsewhere.id
        )
        empty = await asset_services.async_create_category("Empty")

        result = await hass.services.async_call(
            DOMAIN,
            DELETE_CATEGORY,
            {"category_id": empty.id},
            blocking=True,
            return_response=True,
        )

        assert result == {"success": True}
        assert len(asset_services.get_assets_by_category(elsewhere.id)) == 1

    async def test_force_false_is_read_as_no_opt_in(
        self,
        hass: HomeAssistant,
        asset_services: AssetCoordinator,
        category_holding_assets,
    ) -> None:
        """Sending the flag off is the same as not sending it.

        Worth pinning: the handler reads the flag with a ``False`` default,
        so an explicit ``force: false`` must not fall through to the cascade.
        """
        category_id = (await category_holding_assets(1)).id

        with pytest.raises(ServiceValidationError) as caught:
            await hass.services.async_call(
                DOMAIN,
                DELETE_CATEGORY,
                {"category_id": category_id, "force": False},
                blocking=True,
            )

        assert caught.value.translation_key == "asset.category_not_empty"
        assert len(asset_services.assets) == 1

    async def test_a_missing_category_is_still_reported_as_missing(
        self, hass: HomeAssistant, asset_services: AssetCoordinator
    ) -> None:
        """The guard runs after the existence check, not instead of it."""
        with pytest.raises(ServiceValidationError) as caught:
            await hass.services.async_call(
                DOMAIN,
                DELETE_CATEGORY,
                {"category_id": "cat_deadbeef", "force": True},
                blocking=True,
            )

        assert caught.value.translation_key == "asset.category_not_found"


# ---------------------------------------------------------------------------
# ``asset_create_asset`` and ``asset_update_asset`` verify the Category exists
# ---------------------------------------------------------------------------
#
# Both verbs took any ``category_id`` on faith, so an Asset could be filed
# under a Category never created or since deleted — silently unfindable
# through every Category listing, which is how the panel presents assets.
# Issue #68, the mirror of what #43 closed on the note side. The empty string
# is not a claim about any Category ("uncategorised" is a legitimate state),
# so only a non-empty id that resolves to nothing is refused.


class TestCategoryMustExistOnCreate:
    """``asset_create_asset`` refuses a ``category_id`` naming no Category."""

    async def test_refuses_an_unknown_category(
        self, hass: HomeAssistant, asset_services: AssetCoordinator
    ) -> None:
        """The create is refused, and no Asset is written."""
        with pytest.raises(ServiceValidationError) as caught:
            await hass.services.async_call(
                DOMAIN,
                CREATE_ASSET,
                {"name": "Kettle", "category_id": "cat_deadbeef"},
                blocking=True,
            )

        assert caught.value.translation_key == "asset.category_not_found"
        assert dict(asset_services.assets) == {}

    async def test_still_accepts_an_uncategorised_asset(
        self, hass: HomeAssistant, asset_services: AssetCoordinator
    ) -> None:
        """The empty string is "no category", not a dangling reference."""
        result = await hass.services.async_call(
            DOMAIN,
            CREATE_ASSET,
            {"name": "Kettle", "category_id": ""},
            blocking=True,
            return_response=True,
        )

        assert result["success"] is True
        assert result["asset"]["category_id"] == ""

    async def test_still_accepts_a_category_that_exists(
        self, hass: HomeAssistant, asset_services: AssetCoordinator
    ) -> None:
        """The check refuses dangling ids, not categorisation itself."""
        category = await asset_services.async_create_category("Appliances")

        result = await hass.services.async_call(
            DOMAIN,
            CREATE_ASSET,
            {"name": "Kettle", "category_id": category.id},
            blocking=True,
            return_response=True,
        )

        assert result["asset"]["category_id"] == category.id

    async def test_renders_a_message_with_nothing_left_unfilled(
        self, hass: HomeAssistant, asset_services: AssetCoordinator
    ) -> None:
        """The placeholders raised actually fill the published message.

        Home Assistant drops the whole ``.format()`` call when one
        placeholder is missing, showing the raw template instead. Issue #27.
        """
        message = json.loads(STRINGS.read_text(encoding="utf-8"))["exceptions"][
            "asset"
        ]["category_not_found"]["message"]

        with pytest.raises(ServiceValidationError) as caught:
            await hass.services.async_call(
                DOMAIN,
                CREATE_ASSET,
                {"name": "Kettle", "category_id": "cat_deadbeef"},
                blocking=True,
            )

        rendered = message.format(**caught.value.translation_placeholders)
        assert "{" not in rendered
        assert "cat_deadbeef" in rendered


class TestCategoryMustExistOnUpdate:
    """``asset_update_asset`` refuses a ``category_id`` naming no Category."""

    async def test_refuses_an_unknown_category(
        self, hass: HomeAssistant, asset_services: AssetCoordinator
    ) -> None:
        """The move is refused, and the Asset stays where it was."""
        category = await asset_services.async_create_category("Appliances")
        asset = await asset_services.async_create_asset_full(
            "Kettle", category_id=category.id
        )

        with pytest.raises(ServiceValidationError) as caught:
            await hass.services.async_call(
                DOMAIN,
                UPDATE_ASSET,
                {"asset_id": asset.id, "category_id": "cat_deadbeef"},
                blocking=True,
            )

        assert caught.value.translation_key == "asset.category_not_found"
        assert asset_services.get_asset(asset.id).category_id == category.id

    async def test_the_refusal_writes_none_of_the_other_fields(
        self, hass: HomeAssistant, asset_services: AssetCoordinator
    ) -> None:
        """A refused call leaves the whole Asset untouched.

        The handler writes field by field as it walks the call, so the
        Category has to be checked before the first write — otherwise a
        refusal would still have renamed the Asset it refused to move.
        """
        asset = await asset_services.async_create_asset_full(
            "Kettle", brand="Bosch"
        )

        with pytest.raises(ServiceValidationError):
            await hass.services.async_call(
                DOMAIN,
                UPDATE_ASSET,
                {
                    "asset_id": asset.id,
                    "name": "Toaster",
                    "brand": "Philips",
                    "category_id": "cat_deadbeef",
                },
                blocking=True,
            )

        unchanged = asset_services.get_asset(asset.id)
        assert unchanged.name == "Kettle"
        assert unchanged.brand == "Bosch"
        assert unchanged.category_id == ""

    async def test_still_accepts_clearing_the_category(
        self, hass: HomeAssistant, asset_services: AssetCoordinator
    ) -> None:
        """Moving an Asset out of every Category stays a legitimate edit."""
        category = await asset_services.async_create_category("Appliances")
        asset = await asset_services.async_create_asset_full(
            "Kettle", category_id=category.id
        )

        result = await hass.services.async_call(
            DOMAIN,
            UPDATE_ASSET,
            {"asset_id": asset.id, "category_id": ""},
            blocking=True,
            return_response=True,
        )

        assert result["asset"]["category_id"] == ""

    async def test_still_accepts_a_move_to_a_category_that_exists(
        self, hass: HomeAssistant, asset_services: AssetCoordinator
    ) -> None:
        """The check refuses dangling ids, not moving itself."""
        source = await asset_services.async_create_category("Appliances")
        destination = await asset_services.async_create_category("Kitchen")
        asset = await asset_services.async_create_asset_full(
            "Kettle", category_id=source.id
        )

        result = await hass.services.async_call(
            DOMAIN,
            UPDATE_ASSET,
            {"asset_id": asset.id, "category_id": destination.id},
            blocking=True,
            return_response=True,
        )

        assert result["asset"]["category_id"] == destination.id
