"""Panel registration and WebSocket API for Ha Health Record."""
from __future__ import annotations

import csv
import io
import logging
import math
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api, frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import (
    CONF_RECORD_NAME,
    CONF_RECORD_SETS,
    CONF_RECORD_TYPE,
    CONF_RECORD_UNIT,
    DOMAIN,
    EVENT_RECORD_LOGGED,
)
from .coordinator import HealthRecordCoordinator

_LOGGER = logging.getLogger(__name__)

PANEL_TITLE = "Health Record"
PANEL_ICON = "mdi:heart-pulse"
PANEL_URL_PATH = "ha-health-record"  # URL path for the panel in sidebar
PANEL_COMPONENT_NAME = "ha-health-record-panel"  # Web component name
FRONTEND_SCRIPT_PATH = f"/{DOMAIN}/frontend"  # Static path for JS files


@callback
def register_websocket_commands(hass: HomeAssistant) -> None:
    """Register all WebSocket commands (call once, not per entry)."""
    websocket_api.async_register_command(hass, ws_get_members)
    websocket_api.async_register_command(hass, ws_get_records)
    websocket_api.async_register_command(hass, ws_log_record)
    websocket_api.async_register_command(hass, ws_update_record)
    websocket_api.async_register_command(hass, ws_delete_record)
    websocket_api.async_register_command(hass, ws_add_record_type)
    websocket_api.async_register_command(hass, ws_update_record_type)
    websocket_api.async_register_command(hass, ws_delete_record_type)
    websocket_api.async_register_command(hass, ws_add_member)
    websocket_api.async_register_command(hass, ws_update_member)
    websocket_api.async_register_command(hass, ws_delete_member)
    websocket_api.async_register_command(hass, ws_export_csv)


async def async_setup_panel(hass: HomeAssistant) -> None:
    """Set up the Ha Health Record panel (static paths + sidebar)."""
    # Register static path for frontend files
    frontend_path = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths([
        StaticPathConfig(FRONTEND_SCRIPT_PATH, str(frontend_path), cache_headers=False)
    ])

    # Register the panel using panel_custom
    # Add cache-busting timestamp to force browser to reload the JS file
    cache_buster = int(time.time())
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_COMPONENT_NAME,
        frontend_url_path=PANEL_URL_PATH,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=f"{FRONTEND_SCRIPT_PATH}/ha-health-record-panel.js?v={cache_buster}",
        require_admin=False,
        config={},
    )

    # Register sidebar title i18n script (runs on every page)
    frontend.add_extra_js_url(
        hass, f"{FRONTEND_SCRIPT_PATH}/sidebar-title.js?v={cache_buster}"
    )

    _LOGGER.info("Registered Ha Health Record panel")


async def async_unload_panel(hass: HomeAssistant) -> None:
    """Unload the Ha Health Record panel."""
    if PANEL_URL_PATH in hass.data.get(frontend.DATA_PANELS, {}):
        frontend.async_remove_panel(hass, PANEL_URL_PATH)
        _LOGGER.info("Unregistered Ha Health Record panel")


def valid_float(value: Any) -> float:
    """Validate float, rejecting NaN and Infinity."""
    result = vol.Coerce(float)(value)
    if math.isnan(result) or math.isinf(result):
        raise vol.Invalid("NaN and Infinity are not allowed")
    return result


def _get_coordinators(hass: HomeAssistant) -> list[HealthRecordCoordinator]:
    """Get all coordinators from loaded config entries."""
    coordinators: list[HealthRecordCoordinator] = []
    for entry in hass.config_entries.async_entries(DOMAIN):
        if entry.state is ConfigEntryState.LOADED:
            coordinators.append(entry.runtime_data)
    return coordinators


def _find_coordinator(
    hass: HomeAssistant, member_id: str
) -> HealthRecordCoordinator | None:
    """Find a coordinator by member_id (O(1) via cache, O(n) fallback)."""
    # Fast path: use the coordinator lookup dict
    coord_map = hass.data.get(f"{DOMAIN}_coordinator_map", {})
    coord = coord_map.get(member_id)
    if coord is not None:
        return coord
    # Fallback: linear scan (for resilience)
    for coord in _get_coordinators(hass):
        if coord.member_id == member_id:
            return coord
    return None


# ============================================================================
# Query APIs
# ============================================================================


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_health_record/get_members",
    }
)
@callback
def ws_get_members(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle get_members WebSocket command."""
    members = []

    for coordinator in _get_coordinators(hass):
        member = {
            "id": coordinator.member_id,
            "name": coordinator.member_name,
            "note": coordinator.entry.data.get("note", ""),
            "record_sets": [
                {
                    "type": s.type_id,
                    "name": s.name,
                    "unit": s.unit,
                    "default_value": s.default_value,
                    "default_value_mode": s.default_value_mode,
                    "current_value": s.current_value,
                    "last_record": {
                        "value": s.last_record.value,
                        "note": s.last_record.note,
                        "timestamp": (
                            s.last_record.timestamp.isoformat()
                            if s.last_record.timestamp
                            else None
                        ),
                    } if s.last_record else None,
                }
                for s in coordinator.record_sets.values()
            ],
        }
        members.append(member)

    connection.send_result(msg["id"], {"members": members})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_health_record/get_records",
        vol.Required("start_time"): str,
        vol.Required("end_time"): str,
    }
)
@callback
def ws_get_records(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle get_records WebSocket command."""
    try:
        start_time = datetime.fromisoformat(msg["start_time"].replace('Z', '+00:00'))
        end_time = datetime.fromisoformat(msg["end_time"].replace('Z', '+00:00'))
    except ValueError:
        connection.send_error(msg["id"], "invalid_date", "Invalid date format")
        return

    records = []

    # Get records from all coordinators
    for coordinator in _get_coordinators(hass):
        coordinator_records = coordinator.get_records_in_range(start_time, end_time)
        records.extend(coordinator_records)

    # Sort by timestamp descending
    records.sort(key=lambda x: x["timestamp"], reverse=True)

    connection.send_result(msg["id"], {"records": records})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_health_record/export_csv",
        vol.Required("member_id"): str,
    }
)
@callback
def ws_export_csv(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle export_csv WebSocket command."""
    member_id = msg["member_id"]

    coordinator = _find_coordinator(hass, member_id)
    if coordinator is None:
        connection.send_error(msg["id"], "member_not_found", f"Member {member_id} not found")
        return

    records = list(coordinator.records)
    records.sort(key=lambda r: r.get("timestamp", ""))

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "record_type", "record_name", "value", "unit", "note"])

    for record in records:
        type_id = record.get("record_type", "")
        rs = coordinator.record_sets.get(type_id)
        writer.writerow([
            record.get("timestamp", ""),
            type_id,
            rs.name if rs else record.get("record_name", type_id),
            record.get("value", ""),
            rs.unit if rs else record.get("unit", ""),
            record.get("note", ""),
        ])

    connection.send_result(msg["id"], {
        "csv_content": output.getvalue(),
        "member_name": coordinator.member_name,
        "record_count": len(records),
    })


# ============================================================================
# Record Logging API (unified)
# ============================================================================


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_health_record/log_record",
        vol.Required("member_id"): str,
        vol.Required("record_type"): str,
        vol.Required("value"): valid_float,
        vol.Optional("note", default=""): str,
        vol.Optional("timestamp"): str,
    }
)
@websocket_api.require_admin
@callback
def ws_log_record(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle log_record WebSocket command."""
    member_id = msg["member_id"]
    record_type = msg["record_type"]
    value = msg["value"]
    note = msg.get("note", "")
    timestamp_str = msg.get("timestamp")

    # Find the coordinator
    coordinator = _find_coordinator(hass, member_id)
    if coordinator is None:
        connection.send_error(msg["id"], "member_not_found", f"Member {member_id} not found")
        return

    if record_type not in coordinator.record_sets:
        connection.send_error(msg["id"], "record_type_not_found", f"Record type {record_type} not found")
        return

    # Parse optional timestamp
    custom_timestamp = None
    if timestamp_str:
        try:
            custom_timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        except ValueError:
            connection.send_error(msg["id"], "invalid_timestamp", "Invalid timestamp format")
            return

    # Set the values and log
    coordinator.set_record_value(record_type, value)
    coordinator.set_record_note(record_type, note)
    record = coordinator.log_record(record_type, timestamp=custom_timestamp)

    if record is None:
        connection.send_error(msg["id"], "log_failed", "Failed to log record")
        return

    # Fire event
    record_set = coordinator.get_record_set(record_type)
    hass.bus.async_fire(
        EVENT_RECORD_LOGGED,
        {
            "member_id": coordinator.member_id,
            "member_name": coordinator.member_name,
            "record_type": record_type,
            "record_name": record_set.name if record_set else record_type,
            "value": record.value,
            "unit": record_set.unit if record_set else "",
            "note": record.note,
            "timestamp": record.timestamp.isoformat() if record.timestamp else None,
        },
    )

    connection.send_result(msg["id"], {"success": True})


# ============================================================================
# Record Management APIs
# ============================================================================


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_health_record/update_record",
        vol.Required("member_id"): str,
        vol.Required("type_id"): str,
        vol.Required("timestamp"): str,  # ISO format to identify the record
        vol.Optional("record_id"): str,  # UUID -- preferred over timestamp
        vol.Optional("value"): valid_float,
        vol.Optional("note"): str,
        vol.Optional("new_timestamp"): str,  # New timestamp if editing time
    }
)
@websocket_api.require_admin
@callback
def ws_update_record(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle update_record WebSocket command."""
    member_id = msg["member_id"]
    type_id = msg["type_id"]
    timestamp = msg["timestamp"]
    record_id = msg.get("record_id")

    # Find the coordinator
    coordinator = _find_coordinator(hass, member_id)
    if coordinator is None:
        connection.send_error(msg["id"], "member_not_found", f"Member {member_id} not found")
        return

    # Get the update values
    value = msg.get("value")
    note = msg.get("note")
    new_timestamp = msg.get("new_timestamp")

    if coordinator.update_record(
        type_id, timestamp,
        value=value, note=note, new_timestamp=new_timestamp,
        record_id=record_id,
    ):
        connection.send_result(msg["id"], {"success": True})
    else:
        connection.send_error(msg["id"], "record_not_found", "Record not found")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_health_record/delete_record",
        vol.Required("member_id"): str,
        vol.Required("type_id"): str,
        vol.Required("timestamp"): str,
        vol.Optional("record_id"): str,  # UUID -- preferred over timestamp
    }
)
@websocket_api.require_admin
@callback
def ws_delete_record(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle delete_record WebSocket command."""
    member_id = msg["member_id"]
    type_id = msg["type_id"]
    timestamp = msg["timestamp"]
    record_id = msg.get("record_id")

    # Find the coordinator
    coordinator = _find_coordinator(hass, member_id)
    if coordinator is None:
        connection.send_error(msg["id"], "member_not_found", f"Member {member_id} not found")
        return

    if coordinator.delete_record(type_id, timestamp, record_id=record_id):
        connection.send_result(msg["id"], {"success": True})
    else:
        connection.send_error(msg["id"], "record_not_found", "Record not found")


# ============================================================================
# Record Type Management APIs (unified)
# ============================================================================


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_health_record/add_record_type",
        vol.Required("member_id"): str,
        vol.Required("name"): str,
        vol.Required("unit"): str,
        vol.Optional("default_value", default=0): valid_float,
        vol.Optional("default_value_mode", default="fixed"): vol.In(["fixed", "last_value"]),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_add_record_type(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle add_record_type WebSocket command."""
    member_id = msg["member_id"]
    name = msg["name"]
    unit = msg["unit"]
    default_value = msg.get("default_value", 0)

    # Generate type_id from name (sanitize)
    type_id = name.lower().replace(" ", "_").replace("-", "_")
    type_id = "".join(c for c in type_id if c.isalnum() or c == "_")

    if not type_id:
        connection.send_error(msg["id"], "invalid_type_id", "Name must contain at least one alphanumeric character")
        return

    # Find the config entry for this member
    entry = None
    for e in hass.config_entries.async_entries(DOMAIN):
        if e.data.get("member_id") == member_id:
            entry = e
            break

    if entry is None:
        connection.send_error(msg["id"], "member_not_found", f"Member {member_id} not found")
        return

    # Get current record sets
    current_options = dict(entry.options)
    record_sets = list(current_options.get(CONF_RECORD_SETS, []))

    # Check if type already exists across ALL record types
    for s in record_sets:
        if s.get(CONF_RECORD_TYPE) == type_id:
            connection.send_error(msg["id"], "type_exists", f"Record type {type_id} already exists")
            return

    # Add new type
    record_sets.append({
        CONF_RECORD_TYPE: type_id,
        CONF_RECORD_NAME: name,
        CONF_RECORD_UNIT: unit,
        "default_value": default_value,
        "default_value_mode": msg.get("default_value_mode", "fixed"),
    })

    current_options[CONF_RECORD_SETS] = record_sets

    # Update config entry
    hass.config_entries.async_update_entry(entry, options=current_options)

    # Reload entry to create new entities
    await hass.config_entries.async_reload(entry.entry_id)

    connection.send_result(msg["id"], {"success": True, "type_id": type_id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_health_record/update_record_type",
        vol.Required("member_id"): str,
        vol.Required("type_id"): str,
        vol.Required("name"): str,
        vol.Required("unit"): str,
        vol.Optional("default_value"): valid_float,
        vol.Optional("default_value_mode"): vol.In(["fixed", "last_value"]),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_update_record_type(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle update_record_type WebSocket command."""
    member_id = msg["member_id"]
    type_id = msg["type_id"]
    name = msg["name"]
    unit = msg["unit"]
    default_value = msg.get("default_value")

    # Find the config entry for this member
    entry = None
    for e in hass.config_entries.async_entries(DOMAIN):
        if e.data.get("member_id") == member_id:
            entry = e
            break

    if entry is None:
        connection.send_error(msg["id"], "member_not_found", f"Member {member_id} not found")
        return

    # Get current record sets
    current_options = dict(entry.options)
    record_sets = list(current_options.get(CONF_RECORD_SETS, []))

    # Find and update the type (copy-and-replace to ensure HA detects the change)
    found = False
    for i, s in enumerate(record_sets):
        if s.get(CONF_RECORD_TYPE) == type_id:
            updated = dict(s)
            updated[CONF_RECORD_NAME] = name
            updated[CONF_RECORD_UNIT] = unit
            if default_value is not None:
                updated["default_value"] = default_value
            default_value_mode = msg.get("default_value_mode")
            if default_value_mode is not None:
                updated["default_value_mode"] = default_value_mode
            record_sets[i] = updated
            found = True
            break

    if not found:
        connection.send_error(msg["id"], "type_not_found", f"Record type {type_id} not found")
        return

    current_options[CONF_RECORD_SETS] = record_sets

    # Update config entry
    hass.config_entries.async_update_entry(entry, options=current_options)

    # Reload entry to update entities
    await hass.config_entries.async_reload(entry.entry_id)

    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_health_record/delete_record_type",
        vol.Required("member_id"): str,
        vol.Required("type_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete_record_type(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle delete_record_type WebSocket command."""
    member_id = msg["member_id"]
    type_id = msg["type_id"]

    # Find the config entry for this member
    entry = None
    for e in hass.config_entries.async_entries(DOMAIN):
        if e.data.get("member_id") == member_id:
            entry = e
            break

    if entry is None:
        connection.send_error(msg["id"], "member_not_found", f"Member {member_id} not found")
        return

    # Get current record sets
    current_options = dict(entry.options)
    record_sets = list(current_options.get(CONF_RECORD_SETS, []))

    # Find and remove the type
    new_sets = [s for s in record_sets if s.get(CONF_RECORD_TYPE) != type_id]

    if len(new_sets) == len(record_sets):
        connection.send_error(msg["id"], "type_not_found", f"Record type {type_id} not found")
        return

    # Remove entities for the deleted record type from the entity registry
    entity_reg = er.async_get(hass)
    suffixes = [
        ("sensor", "_record"),
        ("button", "_log"),
        ("number", "_value"),
        ("text", "_note"),
    ]
    for platform, suffix in suffixes:
        unique_id = f"{member_id}_{type_id}{suffix}"
        entity_id = entity_reg.async_get_entity_id(platform, DOMAIN, unique_id)
        if entity_id:
            entity_reg.async_remove(entity_id)

    current_options[CONF_RECORD_SETS] = new_sets

    # Update config entry
    hass.config_entries.async_update_entry(entry, options=current_options)

    # Reload entry to remove entities
    await hass.config_entries.async_reload(entry.entry_id)

    connection.send_result(msg["id"], {"success": True})


# ============================================================================
# Member (Person) Management APIs
# ============================================================================

@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_health_record/add_member",
        vol.Required("name"): str,
        vol.Optional("member_id"): str,
        vol.Optional("note", default=""): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_add_member(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle add_member WebSocket command."""
    name = msg["name"]
    member_id = msg.get("member_id")

    # Generate member_id from name if not provided
    if not member_id:
        member_id = name.lower().replace(" ", "_").replace("-", "_")
        member_id = "".join(c for c in member_id if c.isalnum() or c == "_")

    if not member_id:
        connection.send_error(
            msg["id"], "invalid_member_id", "Member ID is empty after sanitization"
        )
        return

    # Check if member already exists
    for e in hass.config_entries.async_entries(DOMAIN):
        if e.data.get("member_id") == member_id:
            connection.send_error(msg["id"], "member_exists", f"Member {member_id} already exists")
            return

    note = msg.get("note", "")

    # Create new config entry via config flow
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": "user"},
        data={"member_name": name, "member_id": member_id, "note": note},
    )

    if result.get("type") == "create_entry":
        connection.send_result(msg["id"], {
            "success": True,
            "member_id": member_id,
            "entry_id": result.get("result").entry_id if result.get("result") else None,
        })
    else:
        connection.send_error(msg["id"], "create_failed", "Failed to create member")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_health_record/update_member",
        vol.Required("member_id"): str,
        vol.Required("name"): str,
        vol.Optional("note", default=""): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_update_member(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle update_member WebSocket command."""
    member_id = msg["member_id"]
    name = msg["name"]

    # Find the config entry for this member
    entry = None
    for e in hass.config_entries.async_entries(DOMAIN):
        if e.data.get("member_id") == member_id:
            entry = e
            break

    if entry is None:
        connection.send_error(msg["id"], "member_not_found", f"Member {member_id} not found")
        return

    note = msg.get("note", "")

    # Update entry data (need to update both data and title)
    new_data = dict(entry.data)
    new_data["member_name"] = name
    new_data["note"] = note

    hass.config_entries.async_update_entry(entry, data=new_data, title=name)

    # Reload to apply changes
    await hass.config_entries.async_reload(entry.entry_id)

    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ha_health_record/delete_member",
        vol.Required("member_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete_member(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle delete_member WebSocket command."""
    member_id = msg["member_id"]

    # Find the config entry for this member
    entry = None
    for e in hass.config_entries.async_entries(DOMAIN):
        if e.data.get("member_id") == member_id:
            entry = e
            break

    if entry is None:
        connection.send_error(msg["id"], "member_not_found", f"Member {member_id} not found")
        return

    # Remove the config entry
    await hass.config_entries.async_remove(entry.entry_id)

    connection.send_result(msg["id"], {"success": True})
