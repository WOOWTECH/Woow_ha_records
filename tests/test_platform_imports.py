"""Every module imports, and platforms agree on the add-entities type.

Issue #37: three asset platform modules imported
``AddConfigEntryEntitiesCallback`` while the test environment pinned a Home
Assistant release that did not have the name yet. No test imported those
modules, so a quarter of the asset Area could not have loaded and the suite
passed anyway. The import test closes that gap for every module at once.

The signature test enforces the other half of #37: one add-entities callback
type across all four Areas. It reads the annotation on the
``async_add_entities`` parameter of every module-level function in the
integration, so a platform module or helper added later is covered the day it
is added.

Modules are enumerated from the filesystem, not ``pkgutil``, so a module that
fails to import is a test failure rather than silently skipped.
"""
from __future__ import annotations

import importlib
import inspect
from pathlib import Path

import pytest
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

import custom_components.woow_ha_records as integration

_INTEGRATION_ROOT = Path(integration.__file__).parent


def _all_module_names() -> list[str]:
    """Dotted name of every Python module in the integration."""
    names = []
    for path in sorted(_INTEGRATION_ROOT.rglob("*.py")):
        parts = path.relative_to(_INTEGRATION_ROOT).with_suffix("").parts
        if parts[-1] == "__init__":
            parts = parts[:-1]
        names.append(".".join((integration.__name__, *parts)))
    return names


@pytest.mark.parametrize("module_name", _all_module_names())
def test_module_imports(module_name: str) -> None:
    """Importing the module raises nothing."""
    importlib.import_module(module_name)


def test_add_entities_annotations_agree() -> None:
    """Every ``async_add_entities`` parameter names the config-entry type.

    The annotation is accepted either as the class itself or as its bare name
    — the string PEP 563 leaves behind in these modules, which all use
    ``from __future__ import annotations``. It is not resolved with
    ``typing.get_type_hints`` because that trips over sibling parameters
    annotated with ``TYPE_CHECKING``-only names.
    """
    expected = AddConfigEntryEntitiesCallback
    offenders: list[str] = []
    for module_name in _all_module_names():
        module = importlib.import_module(module_name)
        for func_name, func in vars(module).items():
            if not inspect.isfunction(func) or func.__module__ != module_name:
                continue
            parameters = inspect.signature(func).parameters
            if "async_add_entities" not in parameters:
                continue
            annotation = parameters["async_add_entities"].annotation
            if annotation is not expected and annotation != expected.__name__:
                offenders.append(
                    f"{module_name}.{func_name}: {annotation}"
                )
    assert not offenders, (
        f"async_add_entities must be annotated {expected.__name__} "
        f"everywhere (issue #37); found:\n" + "\n".join(offenders)
    )
