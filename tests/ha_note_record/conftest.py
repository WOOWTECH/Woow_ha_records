"""Fixtures for ha_note_record tests."""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from homeassistant.core import HomeAssistant

from custom_components.ha_note_record.store import HaNoteRecordStore


@pytest.fixture
def store(hass: HomeAssistant) -> HaNoteRecordStore:
    """Create a HaNoteRecordStore with mocked storage."""
    s = HaNoteRecordStore(hass)
    s._store = AsyncMock()
    s._store.async_load = AsyncMock(return_value=None)
    s._store.async_save = AsyncMock()
    return s
