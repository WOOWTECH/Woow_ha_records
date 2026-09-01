"""Guard manifest.json against keys Home Assistant's schema does not define.

Three such keys accumulated before CI validated the manifest at all:
``homeassistant`` (the minimum version — it lives in ``hacs.json``),
``license`` (the ``LICENSE`` file at the repo root is the real statement),
and ``description`` (a paragraph aimed at AI agents, which now opens the
"Quick Start for AI Agents" section of ``README.md``). hassfest rejected
all three, #35 removed the first, and #36 removed the other two.

CI's validate job runs hassfest's ``manifest`` plugin, which checks the
full schema; this test only pins the three keys that actually burned us,
so the mistake is caught on Windows before a PR ever reaches CI.
"""
from __future__ import annotations

import json
from pathlib import Path

MANIFEST = (
    Path(__file__).parent.parent
    / "custom_components"
    / "woow_ha_records"
    / "manifest.json"
)


def test_manifest_carries_none_of_the_keys_that_burned_us() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

    present = sorted({"description", "license", "homeassistant"} & set(manifest))
    assert not present, (
        f"manifest.json carries key(s) Home Assistant's manifest schema "
        f"does not define: {present}. The minimum HA version belongs in "
        f"hacs.json, the license in LICENSE, and the agent-facing "
        f"description in README.md's Quick Start for AI Agents."
    )
