"""Panel and WebSocket API for Ha Finance Record."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import voluptuous as vol

from homeassistant.components import frontend, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import device_registry as dr

from .const import (
    CONF_ACCOUNT_ID,
    CONF_ACCOUNT_NAME,
    CONF_INITIAL_BALANCE,
    DOMAIN,
    FREQUENCY_DAILY,
    FREQUENCY_MONTHLY,
    FREQUENCY_OPTIONS,
    FREQUENCY_WEEKLY,
    FREQUENCY_YEARLY,
    TRANSACTION_MANUAL,
)
from .coordinator import FinanceCoordinator, get_coordinator_for_account
from .models import RecurringPlan, Transaction

if TYPE_CHECKING:
    from .store import FinanceStore

_LOGGER = logging.getLogger(__name__)

PANEL_URL = "/ha_finance_panel"
PANEL_ICON = "mdi:finance"
PANEL_TITLE = "Finance Record"
PANEL_VERSION = "1.0.0"


async def async_setup_panel(hass: HomeAssistant) -> None:
    """Set up the Ha Finance panel."""
    # Register static path for frontend files
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                PANEL_URL,
                hass.config.path(
                    "custom_components/ha_finance/frontend"
                ),
                cache_headers=False,
            )
        ]
    )

    # Register the panel using frontend.async_register_built_in_panel
    frontend.async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path="ha-finance",
        config={
            "_panel_custom": {
                "name": "ha-finance-panel",
                "module_url": f"{PANEL_URL}/ha-finance-panel.js?v={PANEL_VERSION}",
            }
        },
        require_admin=False,
        update=True,
    )

    # Register WebSocket commands
    websocket_api.async_register_command(hass, ws_get_accounts)
    websocket_api.async_register_command(hass, ws_get_account)
    websocket_api.async_register_command(hass, ws_add_transaction)
    websocket_api.async_register_command(hass, ws_update_transaction)
    websocket_api.async_register_command(hass, ws_delete_transaction)
    websocket_api.async_register_command(hass, ws_add_plan)
    websocket_api.async_register_command(hass, ws_update_plan)
    websocket_api.async_register_command(hass, ws_delete_plan)
    websocket_api.async_register_command(hass, ws_get_chart_data)
    websocket_api.async_register_command(hass, ws_add_account)
    websocket_api.async_register_command(hass, ws_update_account)
    websocket_api.async_register_command(hass, ws_delete_account)

    _LOGGER.info("Ha Finance panel registered")


async def async_remove_panel(hass: HomeAssistant) -> None:
    """Remove the Ha Finance panel."""
    frontend.async_remove_panel(hass, "ha-finance")


def _get_store(hass: HomeAssistant) -> FinanceStore:
    """Get the shared finance store from hass.data."""
    from .store import FinanceStore
    domain_data = hass.data.get(DOMAIN, {})
    store = domain_data.get("store")
    if store is not None:
        return store
    # Fallback: create store if not yet initialized (e.g., panel loaded before setup)
    store = FinanceStore(hass)
    hass.data.setdefault(DOMAIN, {})["store"] = store
    return store


# WebSocket Handlers

@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_finance/accounts",
    }
)
@websocket_api.async_response
async def ws_get_accounts(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Get all accounts."""
    store = _get_store(hass)
    await store.async_load()

    accounts = [
        {
            "id": account.id,
            "name": account.name,
            "balance": account.balance,
            "notes": account.notes,
        }
        for account in store.data.accounts.values()
    ]

    connection.send_result(msg["id"], {"accounts": accounts})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_finance/account",
        vol.Required("account_id"): str,
    }
)
@websocket_api.async_response
async def ws_get_account(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Get account details including transactions and plans."""
    store = _get_store(hass)
    await store.async_load()

    account = store.data.get_account(msg["account_id"])
    if account is None:
        connection.send_error(msg["id"], "not_found", "Account not found")
        return

    result = {
        "account": {
            "id": account.id,
            "name": account.name,
            "balance": account.balance,
            "notes": account.notes,
            "transactions": [tx.to_dict() for tx in account.transactions],
            "recurring_plans": {
                plan_id: plan.to_dict()
                for plan_id, plan in account.recurring_plans.items()
            },
        }
    }

    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_finance/add_transaction",
        vol.Required("account_id"): str,
        vol.Required("amount"): vol.Coerce(float),
        vol.Optional("note", default=""): str,
        vol.Optional("transaction_type", default=TRANSACTION_MANUAL): str,
    }
)
@websocket_api.async_response
async def ws_add_transaction(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Add a new transaction."""
    coordinator = get_coordinator_for_account(hass, msg["account_id"])
    transaction: Transaction | None = None

    if coordinator is None:
        # Fall back to direct store access
        store = _get_store(hass)
        await store.async_load()
        account = store.data.get_account(msg["account_id"])
        if account is None:
            connection.send_error(msg["id"], "not_found", "Account not found")
            return

        transaction = Transaction.create(
            amount=msg["amount"],
            note=msg["note"],
            transaction_type=msg["transaction_type"],
        )
        account.add_transaction(transaction)
        await store.async_save()
    else:
        transaction = await coordinator.async_add_transaction(
            amount=msg["amount"],
            note=msg["note"],
            transaction_type=msg["transaction_type"],
        )

    if transaction is None:
        connection.send_error(msg["id"], "error", "Failed to create transaction")
        return

    connection.send_result(
        msg["id"],
        {"success": True, "transaction": transaction.to_dict()},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_finance/update_transaction",
        vol.Required("account_id"): str,
        vol.Required("transaction_id"): str,
        vol.Optional("amount"): vol.Coerce(float),
        vol.Optional("note"): str,
    }
)
@websocket_api.async_response
async def ws_update_transaction(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Update an existing transaction."""
    store = _get_store(hass)
    await store.async_load()

    account = store.data.get_account(msg["account_id"])
    if account is None:
        connection.send_error(msg["id"], "not_found", "Account not found")
        return

    # Find and update transaction
    transaction = None
    for tx in account.transactions:
        if tx.id == msg["transaction_id"]:
            transaction = tx
            break

    if transaction is None:
        connection.send_error(msg["id"], "not_found", "Transaction not found")
        return

    # Update balance if amount changed
    if "amount" in msg:
        old_amount = transaction.amount
        new_amount = msg["amount"]
        account.balance += (new_amount - old_amount)
        transaction.amount = new_amount

    if "note" in msg:
        transaction.note = msg["note"]

    await store.async_save()

    # Refresh coordinator if available
    coordinator = get_coordinator_for_account(hass, msg["account_id"])
    if coordinator:
        await coordinator.async_refresh()

    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_finance/delete_transaction",
        vol.Required("account_id"): str,
        vol.Required("transaction_id"): str,
    }
)
@websocket_api.async_response
async def ws_delete_transaction(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete a transaction."""
    store = _get_store(hass)
    await store.async_load()

    account = store.data.get_account(msg["account_id"])
    if account is None:
        connection.send_error(msg["id"], "not_found", "Account not found")
        return

    # Find and remove transaction
    transaction = None
    for i, tx in enumerate(account.transactions):
        if tx.id == msg["transaction_id"]:
            transaction = tx
            account.transactions.pop(i)
            break

    if transaction is None:
        connection.send_error(msg["id"], "not_found", "Transaction not found")
        return

    # Reverse the balance change
    account.balance -= transaction.amount
    await store.async_save()

    # Refresh coordinator if available
    coordinator = get_coordinator_for_account(hass, msg["account_id"])
    if coordinator:
        await coordinator.async_refresh()

    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_finance/add_plan",
        vol.Required("account_id"): str,
        vol.Required("title"): str,
        vol.Required("amount"): vol.Coerce(float),
        vol.Required("frequency"): vol.In(FREQUENCY_OPTIONS),
        vol.Required("day"): vol.All(vol.Coerce(int), vol.Range(min=1, max=28)),
        vol.Optional("month", default=1): vol.All(vol.Coerce(int), vol.Range(min=1, max=12)),
        vol.Optional("active", default=True): bool,
    }
)
@websocket_api.async_response
async def ws_add_plan(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Add a new recurring plan."""
    import uuid

    coordinator = get_coordinator_for_account(hass, msg["account_id"])
    plan_id = f"plan_{uuid.uuid4().hex[:8]}"

    if coordinator is None:
        # Fall back to direct store access
        store = _get_store(hass)
        await store.async_load()
        account = store.data.get_account(msg["account_id"])
        if account is None:
            connection.send_error(msg["id"], "not_found", "Account not found")
            return
        plan = RecurringPlan(
            id=plan_id,
            title=msg["title"],
            amount=msg["amount"],
            frequency=msg["frequency"],
            day=msg["day"],
            month=msg.get("month", 1),
            active=msg.get("active", True),
        )
        account.add_recurring_plan(plan)
        await store.async_save()
    else:
        await coordinator.async_add_recurring_plan(
            plan_id=plan_id,
            title=msg["title"],
            amount=msg["amount"],
            frequency=msg["frequency"],
            day=msg["day"],
            month=msg["month"],
            active=msg["active"],
        )

    connection.send_result(msg["id"], {"success": True, "plan_id": plan_id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_finance/update_plan",
        vol.Required("account_id"): str,
        vol.Required("plan_id"): str,
        vol.Optional("title"): str,
        vol.Optional("amount"): vol.Coerce(float),
        vol.Optional("frequency"): vol.In(FREQUENCY_OPTIONS),
        vol.Optional("day"): vol.All(vol.Coerce(int), vol.Range(min=1, max=28)),
        vol.Optional("month"): vol.All(vol.Coerce(int), vol.Range(min=1, max=12)),
        vol.Optional("active"): bool,
    }
)
@websocket_api.async_response
async def ws_update_plan(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Update a recurring plan."""
    coordinator = get_coordinator_for_account(hass, msg["account_id"])

    # Extract update fields
    update_fields = {}
    for field in ["title", "amount", "frequency", "day", "month", "active"]:
        if field in msg:
            update_fields[field] = msg[field]

    if coordinator is None:
        # Fall back to direct store access
        store = _get_store(hass)
        await store.async_load()
        account = store.data.get_account(msg["account_id"])
        if account is None:
            connection.send_error(msg["id"], "not_found", "Account not found")
            return
        plan = account.recurring_plans.get(msg["plan_id"])
        if plan is None:
            connection.send_error(msg["id"], "not_found", "Plan not found")
            return
        for key, value in update_fields.items():
            setattr(plan, key, value)
        await store.async_save()
    else:
        await coordinator.async_update_recurring_plan(msg["plan_id"], **update_fields)

    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_finance/delete_plan",
        vol.Required("account_id"): str,
        vol.Required("plan_id"): str,
    }
)
@websocket_api.async_response
async def ws_delete_plan(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete a recurring plan."""
    coordinator = get_coordinator_for_account(hass, msg["account_id"])

    if coordinator is None:
        # Fall back to direct store access
        store = _get_store(hass)
        await store.async_load()
        account = store.data.get_account(msg["account_id"])
        if account is None:
            connection.send_error(msg["id"], "not_found", "Account not found")
            return
        account.remove_recurring_plan(msg["plan_id"])
        await store.async_save()
    else:
        await coordinator.async_remove_recurring_plan(msg["plan_id"])

    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_finance/chart_data",
        vol.Required("account_id"): str,
        vol.Optional("months", default=6): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def ws_get_chart_data(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Get chart data for income vs expenses by month."""
    from datetime import datetime
    from collections import defaultdict

    store = _get_store(hass)
    await store.async_load()

    account = store.data.get_account(msg["account_id"])
    if account is None:
        connection.send_error(msg["id"], "not_found", "Account not found")
        return

    # Group transactions by month
    months_data: dict[str, dict[str, float]] = defaultdict(
        lambda: {"income": 0.0, "expenses": 0.0}
    )

    for tx in account.transactions:
        try:
            tx_date = datetime.fromisoformat(tx.timestamp)
            month_key = tx_date.strftime("%Y-%m")

            if tx.amount >= 0:
                months_data[month_key]["income"] += tx.amount
            else:
                months_data[month_key]["expenses"] += abs(tx.amount)
        except (ValueError, TypeError):
            continue

    # Sort by month and limit to requested number
    sorted_months = sorted(months_data.keys(), reverse=True)[: msg["months"]]
    sorted_months.reverse()  # Oldest first for chart

    chart_data = [
        {
            "month": month,
            "income": round(months_data[month]["income"], 2),
            "expenses": round(months_data[month]["expenses"], 2),
        }
        for month in sorted_months
    ]

    connection.send_result(msg["id"], {"data": chart_data})


# Account Management WebSocket Handlers

@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_finance/add_account",
        vol.Required("name"): str,
        vol.Optional("initial_balance", default=0.0): vol.Coerce(float),
    }
)
@websocket_api.async_response
async def ws_add_account(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Add a new account via ConfigEntry flow."""
    name = msg["name"].strip()
    if not name:
        connection.send_error(msg["id"], "invalid_name", "Account name cannot be empty")
        return

    balance = msg["initial_balance"]

    # Route through ConfigEntry flow so account gets a proper entry
    try:
        result = await hass.config_entries.flow.async_init(
            DOMAIN,
            context={"source": "ws_panel"},
            data={"name": name, "initial_balance": balance},
        )
    except Exception:
        _LOGGER.exception("Failed to create account via config flow")
        connection.send_error(msg["id"], "flow_error", "Failed to create account config entry")
        return

    if result.get("type") != FlowResultType.CREATE_ENTRY:
        reason = result.get("reason", "unknown")
        connection.send_error(
            msg["id"],
            "flow_failed",
            f"Config flow did not create entry: {reason}",
        )
        return

    # The flow created a new ConfigEntry. async_setup_entry will have run
    # and registered the coordinator. Find it from the new entry.
    entry_id = result.get("result", {}).entry_id if result.get("result") else None
    if entry_id is None:
        connection.send_error(msg["id"], "flow_error", "Config entry created but ID not found")
        return

    coordinator = hass.data.get(DOMAIN, {}).get(entry_id)
    if isinstance(coordinator, FinanceCoordinator) and coordinator.account:
        account = coordinator.account
        connection.send_result(
            msg["id"],
            {
                "success": True,
                "account": {
                    "id": account.id,
                    "name": account.name,
                    "balance": account.balance,
                },
            },
        )
    else:
        # Entry created but coordinator not ready yet; return entry data directly
        entry = result.get("result")
        connection.send_result(
            msg["id"],
            {
                "success": True,
                "account": {
                    "id": entry.data.get(CONF_ACCOUNT_ID, ""),
                    "name": entry.data.get(CONF_ACCOUNT_NAME, name),
                    "balance": entry.data.get(CONF_INITIAL_BALANCE, balance),
                },
            },
        )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_finance/update_account",
        vol.Required("account_id"): str,
        vol.Optional("name"): str,
        vol.Optional("notes"): str,
    }
)
@websocket_api.async_response
async def ws_update_account(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Update an account (rename and/or notes)."""
    store = _get_store(hass)
    await store.async_load()

    account = store.data.get_account(msg["account_id"])
    if account is None:
        connection.send_error(msg["id"], "not_found", "Account not found")
        return

    if "name" in msg:
        name = msg["name"].strip()
        if not name:
            connection.send_error(msg["id"], "invalid_name", "Account name cannot be empty")
            return
        # Check for duplicate name (excluding current account)
        for existing in store.data.accounts.values():
            if existing.id != msg["account_id"] and existing.name.lower() == name.lower():
                connection.send_error(msg["id"], "duplicate_name", "Account with this name already exists")
                return
        account.name = name

    if "notes" in msg:
        account.notes = msg["notes"]

    await store.async_save()

    # Refresh coordinator if available
    coordinator = get_coordinator_for_account(hass, msg["account_id"])
    if coordinator:
        await coordinator.async_refresh()

    # If name was changed, sync to config entry title and device registry
    if "name" in msg:
        for entry in hass.config_entries.async_entries(DOMAIN):
            if entry.data.get(CONF_ACCOUNT_ID) == msg["account_id"]:
                new_data = dict(entry.data)
                new_data[CONF_ACCOUNT_NAME] = account.name
                hass.config_entries.async_update_entry(
                    entry, title=account.name, data=new_data
                )
                device_reg = dr.async_get(hass)
                device = device_reg.async_get_device(
                    identifiers={(DOMAIN, msg["account_id"])}
                )
                if device:
                    device_reg.async_update_device(device.id, name=account.name)
                break

    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_finance/delete_account",
        vol.Required("account_id"): str,
    }
)
@websocket_api.async_response
async def ws_delete_account(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete an account via ConfigEntry removal."""
    account_id = msg["account_id"]

    # Find the config entry that owns this account
    entry_to_remove = None
    for entry in hass.config_entries.async_entries(DOMAIN):
        if entry.data.get(CONF_ACCOUNT_ID) == account_id:
            entry_to_remove = entry
            break

    if entry_to_remove is None:
        connection.send_error(msg["id"], "not_found", "Account config entry not found")
        return

    # Remove via ConfigEntry lifecycle (triggers async_unload_entry + async_remove_entry)
    try:
        await hass.config_entries.async_remove(entry_to_remove.entry_id)
    except Exception:
        _LOGGER.exception("Failed to remove config entry for account %s", account_id)
        connection.send_error(msg["id"], "remove_error", "Failed to remove account config entry")
        return

    connection.send_result(msg["id"], {"success": True})
