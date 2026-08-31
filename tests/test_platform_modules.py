"""Import-level smoke test over every module in the integration.

None of the platform modules has a unit test, which is how issue #37 happened:
three asset modules imported ``AddConfigEntryEntitiesCallback`` while the test
environment pinned a Home Assistant release that predated the name. A quarter
of the asset Area could not import, and the suite stayed green because nothing
ever imported those files.

Two rules are encoded here:

1. Every module under ``custom_components.woow_ha_records`` must import in the
   pinned test environment. This is what would have caught #37's ImportError.
2. ``async_add_entities`` is typed ``AddConfigEntryEntitiesCallback``
   everywhere — the issue's completion condition of one name across all four
   Areas. The legacy ``AddEntitiesCallback`` must not appear in any module's
   namespace, so it cannot creep back in as an import, alias, or helper
   signature.
"""
from __future__ import annotations

import importlib
import inspect
import pkgutil

import pytest

import custom_components.woow_ha_records as component_pkg

REQUIRED_CALLBACK = "AddConfigEntryEntitiesCallback"
LEGACY_CALLBACK = "AddEntitiesCallback"


def _all_module_names() -> list[str]:
    """Every importable module in the integration, discovered, not listed.

    Discovery means a new platform module or Area is covered the day it is
    added, without anyone remembering this file exists.
    """
    return [component_pkg.__name__] + [
        info.name
        for info in pkgutil.walk_packages(
            component_pkg.__path__, prefix=component_pkg.__name__ + "."
        )
    ]


def _annotation_name(annotation: object) -> str:
    """The bare class name of a parameter annotation.

    With ``from __future__ import annotations`` the annotation is the source
    string; without it, the class itself. Normalise both to a name.
    """
    if isinstance(annotation, str):
        return annotation
    return getattr(annotation, "__name__", repr(annotation))


@pytest.mark.parametrize("module_name", _all_module_names())
def test_module_imports_and_uses_one_callback_name(module_name: str) -> None:
    """The module imports cleanly and never touches the legacy callback."""
    module = importlib.import_module(module_name)

    assert not hasattr(module, LEGACY_CALLBACK), (
        f"{module_name} imports {LEGACY_CALLBACK}; the integration standardised "
        f"on {REQUIRED_CALLBACK} (issue #37)"
    )

    for func_name, func in inspect.getmembers(module, inspect.isfunction):
        if func.__module__ != module_name:
            continue
        annotation = func.__annotations__.get("async_add_entities")
        if annotation is None:
            continue
        assert _annotation_name(annotation) == REQUIRED_CALLBACK, (
            f"{module_name}.{func_name} annotates async_add_entities as "
            f"{_annotation_name(annotation)}; expected {REQUIRED_CALLBACK} "
            f"(issue #37)"
        )
