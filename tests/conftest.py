"""Shared test fixtures for ha-record suite."""
from __future__ import annotations

import pytest

from homeassistant.core import HomeAssistant


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Enable custom integrations for all tests."""
    yield
