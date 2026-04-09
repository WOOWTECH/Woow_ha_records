"""Ha Finance Record integration for Home Assistant."""
from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.typing import ConfigType

from .const import CONF_ACCOUNT_ID, CONF_ACCOUNT_NAME, CONF_INITIAL_BALANCE, DOMAIN
from .coordinator import FinanceCoordinator
from .models import Account
from .panel import async_setup_panel, async_remove_panel
from .store import FinanceStore

_LOGGER = logging.getLogger(__name__)

# Keys for metadata stored in hass.data[DOMAIN]
_PANEL_REGISTERED_KEY = "_panel_registered"
_STORE_KEY = "store"

PLATFORMS_LIST: list[Platform] = [
    Platform.SENSOR,
]


def _get_or_create_store(hass: HomeAssistant) -> FinanceStore:
    """Get existing store or create a new one in hass.data."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    if _STORE_KEY not in domain_data:
        domain_data[_STORE_KEY] = FinanceStore(hass)
    return domain_data[_STORE_KEY]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up Ha Finance domain — runs once before any config entries."""
    hass.data.setdefault(DOMAIN, {})

    # Register panel, WebSocket commands, and event listeners (once)
    await async_setup_panel(hass)
    hass.data[DOMAIN][_PANEL_REGISTERED_KEY] = True

    # Initialize shared store
    _get_or_create_store(hass)

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Ha Finance from a config entry."""
    store = hass.data[DOMAIN][_STORE_KEY]

    coordinator = FinanceCoordinator(hass, entry, store)
    await coordinator.async_setup()

    # Ensure account exists in storage
    account_id = entry.data[CONF_ACCOUNT_ID]
    account_name = entry.data[CONF_ACCOUNT_NAME]
    initial_balance = entry.data.get(CONF_INITIAL_BALANCE, 0.0)

    if coordinator.data.get_account(account_id) is None:
        account = Account(
            id=account_id,
            name=account_name,
            balance=initial_balance,
        )
        coordinator.data.add_account(account)
        await coordinator.store.async_save()
        await coordinator.async_refresh()

    hass.data[DOMAIN][entry.entry_id] = coordinator

    # Register device
    device_registry = dr.async_get(hass)
    device_registry.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, account_id)},
        name=account_name,
        manufacturer="Ha Finance",
        model="Financial Account",
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS_LIST)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    coordinator: FinanceCoordinator = hass.data[DOMAIN][entry.entry_id]
    await coordinator.async_shutdown()

    if unload_ok := await hass.config_entries.async_unload_platforms(entry, PLATFORMS_LIST):
        hass.data[DOMAIN].pop(entry.entry_id)

    # Remove panel if no more config entries
    remaining_entries = [
        k for k in hass.data.get(DOMAIN, {}).keys()
        if k not in (_PANEL_REGISTERED_KEY, _STORE_KEY)
    ]
    if not remaining_entries and hass.data[DOMAIN].get(_PANEL_REGISTERED_KEY):
        await async_remove_panel(hass)
        hass.data[DOMAIN][_PANEL_REGISTERED_KEY] = False

    return unload_ok


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle removal of an entry."""
    account_id = entry.data[CONF_ACCOUNT_ID]

    # Try to get coordinator from hass.data first (if not yet unloaded)
    coordinator: FinanceCoordinator | None = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if coordinator:
        coordinator.data.remove_account(account_id)
        await coordinator.store.async_save()
    else:
        # Coordinator already unloaded, access store directly
        store = _get_or_create_store(hass)
        await store.async_load()
        store.data.remove_account(account_id)
        await store.async_save()
