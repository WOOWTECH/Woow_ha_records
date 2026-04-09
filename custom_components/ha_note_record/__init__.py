"""Ha Note Record integration for Home Assistant."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PLATFORMS
from .panel import async_register_panel, async_unregister_panel
from .store import HaNoteRecordStore
from .websocket_api import async_register_websocket_api

_LOGGER = logging.getLogger(__name__)

type HaNoteRecordConfigEntry = ConfigEntry[HaNoteRecordStore]

DATA_PANEL_REGISTERED = f"{DOMAIN}_panel_registered"
DATA_WS_REGISTERED = f"{DOMAIN}_ws_registered"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Ha Note Record component."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: HaNoteRecordConfigEntry) -> bool:
    """Set up Ha Note Record from a config entry."""
    store = HaNoteRecordStore(hass)
    await store.async_load()

    entry.runtime_data = store
    hass.data[DOMAIN]["store"] = store

    # Register WebSocket API (once, idempotent)
    if not hass.data.get(DATA_WS_REGISTERED):
        async_register_websocket_api(hass)
        hass.data[DATA_WS_REGISTERED] = True

    # Register panel (only once) — set flag before await to prevent race
    if not hass.data.get(DATA_PANEL_REGISTERED):
        hass.data[DATA_PANEL_REGISTERED] = True
        await async_register_panel(hass)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(async_update_options))

    return True


async def async_unload_entry(hass: HomeAssistant, entry: HaNoteRecordConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    # Unregister panel if this is the last entry
    if unload_ok:
        remaining_entries = [
            e for e in hass.config_entries.async_entries(DOMAIN)
            if e.entry_id != entry.entry_id
        ]
        if not remaining_entries and hass.data.get(DATA_PANEL_REGISTERED):
            await async_unregister_panel(hass)
            hass.data[DATA_PANEL_REGISTERED] = False

    # Clean up hass.data
    if DOMAIN in hass.data:
        hass.data[DOMAIN].pop("store", None)

    return unload_ok


async def async_update_options(hass: HomeAssistant, entry: HaNoteRecordConfigEntry) -> None:
    """Handle options update."""
    await hass.config_entries.async_reload(entry.entry_id)
