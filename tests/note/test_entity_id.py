"""Tests for length-bounded note entity IDs.

A note title may be up to ``MAX_NOTE_TITLE_LENGTH`` (200) characters. Slugifying
a CJK title romanises each character into several ASCII ones, so the object_id
Home Assistant would derive from ``"{category} {title}"`` runs well past the
255-character entity_id limit. HA truncates to 255, and that cut can land on an
underscore -- which ``valid_entity_id`` rejects, so writing the state raises.
"""
from __future__ import annotations

import pytest

from homeassistant.components.switch import ENTITY_ID_FORMAT as SWITCH_ENTITY_ID_FORMAT
from homeassistant.components.text import ENTITY_ID_FORMAT as TEXT_ENTITY_ID_FORMAT
from homeassistant.const import MAX_LENGTH_STATE_ENTITY_ID
from homeassistant.core import HomeAssistant, valid_entity_id
from homeassistant.helpers import entity_registry as er
from homeassistant.util import slugify

from custom_components.woow_ha_records.areas.note.const import (
    DOMAIN,
    MAX_NOTE_TITLE_LENGTH,
)
from custom_components.woow_ha_records.areas.note.entity import note_entity_id
from custom_components.woow_ha_records.areas.note.store import Category, Note
from custom_components.woow_ha_records.areas.note.switch import HaNoteRecordSwitchEntity
from custom_components.woow_ha_records.areas.note.text import HaNoteRecordTextEntity

CATEGORY_NAME = "個人筆記"
MAX_LENGTH_TITLE = "字" * MAX_NOTE_TITLE_LENGTH
ENTITY_ID_FORMATS = [TEXT_ENTITY_ID_FORMAT, SWITCH_ENTITY_ID_FORMAT]
ENTITY_CLASSES = [HaNoteRecordTextEntity, HaNoteRecordSwitchEntity]


def make_category(name: str = CATEGORY_NAME) -> Category:
    """Build a category."""
    return Category(id="cat1", name=name, created_at="2025-06-15T10:00:00+00:00")


def make_note(title: str, note_id: str = "note1") -> Note:
    """Build a note with the given title."""
    return Note(
        id=note_id,
        category_id="cat1",
        title=title,
        content="",
        pinned=False,
        created_at="2025-06-15T10:00:00+00:00",
        updated_at="2025-06-15T10:00:00+00:00",
    )


class TestNoteEntityId:
    """Tests for the note_entity_id helper."""

    @pytest.mark.parametrize("entity_id_format", ENTITY_ID_FORMATS)
    def test_short_name_unchanged(self, entity_id_format: str):
        """Test a name that fits is slugified as Home Assistant would."""
        assert note_entity_id(
            entity_id_format, "Work", "Shopping list", "note1"
        ) == entity_id_format.format(slugify("Work Shopping list"))

    @pytest.mark.parametrize("entity_id_format", ENTITY_ID_FORMATS)
    def test_max_length_title_within_limit(self, entity_id_format: str):
        """Test a 200-character CJK title yields a valid, bounded entity_id."""
        # Without a bound this name is far past what an entity_id can hold.
        unbounded = slugify(f"{CATEGORY_NAME} {MAX_LENGTH_TITLE}")
        assert len(unbounded) > MAX_LENGTH_STATE_ENTITY_ID

        entity_id = note_entity_id(
            entity_id_format, CATEGORY_NAME, MAX_LENGTH_TITLE, "note1"
        )
        assert len(entity_id) <= MAX_LENGTH_STATE_ENTITY_ID
        assert valid_entity_id(entity_id)

    @pytest.mark.parametrize("entity_id_format", ENTITY_ID_FORMATS)
    @pytest.mark.parametrize("char", ["字", "記", "人", "安", "測"])
    def test_every_title_length_valid(self, entity_id_format: str, char: str):
        """Test no title length up to the maximum produces a bad slug."""
        for length in range(1, MAX_NOTE_TITLE_LENGTH + 1):
            entity_id = note_entity_id(
                entity_id_format, CATEGORY_NAME, char * length, "note1"
            )
            assert len(entity_id) <= MAX_LENGTH_STATE_ENTITY_ID, length
            assert valid_entity_id(entity_id), (length, entity_id)

    def test_stable_for_same_note(self):
        """Test the same note always gets the same entity_id."""
        args = (TEXT_ENTITY_ID_FORMAT, CATEGORY_NAME, MAX_LENGTH_TITLE, "note1")
        assert note_entity_id(*args) == note_entity_id(*args)

    def test_same_title_different_notes(self):
        """Test two identically titled long notes get distinct entity_ids."""
        assert note_entity_id(
            TEXT_ENTITY_ID_FORMAT, CATEGORY_NAME, MAX_LENGTH_TITLE, "note1"
        ) != note_entity_id(
            TEXT_ENTITY_ID_FORMAT, CATEGORY_NAME, MAX_LENGTH_TITLE, "note2"
        )

    def test_unslugifiable_name(self):
        """Test a name with nothing to slugify still yields a valid entity_id."""
        assert valid_entity_id(note_entity_id(TEXT_ENTITY_ID_FORMAT, "…", "★", "note1"))


class TestHaNoteRecordEntity:
    """Tests for the entity_id the note platforms hand Home Assistant."""

    @pytest.mark.parametrize("entity_class", ENTITY_CLASSES)
    def test_entity_id_bounded(self, store, entity_class):
        """Test the entity_id is valid at the maximum title length."""
        entity = entity_class(store, make_note(MAX_LENGTH_TITLE), make_category())
        assert len(entity.entity_id) <= MAX_LENGTH_STATE_ENTITY_ID
        assert valid_entity_id(entity.entity_id)

    @pytest.mark.parametrize("entity_class", ENTITY_CLASSES)
    async def test_repairs_registered_entity_id(
        self,
        hass: HomeAssistant,
        entity_registry: er.EntityRegistry,
        store,
        entity_class,
    ):
        """Test an entity_id already in the registry unusably long is renamed."""
        entity = entity_class(store, make_note(MAX_LENGTH_TITLE), make_category())
        domain = entity.entity_id.split(".", 1)[0]

        # Reproduce the pre-fix registry entry: Home Assistant cuts an
        # unbounded slug at 255 and stores whatever that leaves behind. A
        # romanised CJK title lands the cut on an underscore, as this does.
        broken = entity_registry.async_get_or_create(
            domain, DOMAIN, entity.unique_id, suggested_object_id="a_" * 200
        )
        assert not valid_entity_id(broken.entity_id)

        entity.async_repair_registry_entity_id(hass)

        repaired = entity_registry.async_get_entity_id(
            domain, DOMAIN, entity.unique_id
        )
        assert repaired is not None
        assert valid_entity_id(repaired)

    @pytest.mark.parametrize("entity_class", ENTITY_CLASSES)
    async def test_repair_leaves_usable_entity_id_alone(
        self,
        hass: HomeAssistant,
        entity_registry: er.EntityRegistry,
        store,
        entity_class,
    ):
        """Test a registry entry Home Assistant accepts is left untouched."""
        entity = entity_class(store, make_note("Shopping list"), make_category("Work"))
        domain = entity.entity_id.split(".", 1)[0]
        existing = entity_registry.async_get_or_create(
            domain, DOMAIN, entity.unique_id, suggested_object_id="work_shopping_list"
        )

        entity.async_repair_registry_entity_id(hass)

        assert (
            entity_registry.async_get_entity_id(domain, DOMAIN, entity.unique_id)
            == existing.entity_id
        )
