"""Base entity for Ha Note Record integration.

Provides the common base class for all note record entities (text and switch),
including shared device info, the no-poll update pattern, and the
length-bounded entity_id every note entity suggests to Home Assistant.
"""

from __future__ import annotations

import hashlib
import logging

from homeassistant.const import MAX_LENGTH_STATE_ENTITY_ID
from homeassistant.core import HomeAssistant, callback, valid_entity_id
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity
from homeassistant.util import slugify

from ...const import device_id
from .const import AREA, DOMAIN
from .store import Category, HaNoteRecordStore, Note

_LOGGER = logging.getLogger(__name__)

# Hex characters of the note-id digest appended to a truncated object_id.
ENTITY_ID_HASH_LENGTH = 8

# Characters held back from the object_id budget, so an entity_id that is
# already taken can be suffixed with "_2", "_3" and so on without Home
# Assistant having to cut the string to make room.
ENTITY_ID_COLLISION_RESERVE = 10


def note_entity_id(
    entity_id_format: str,
    category_name: str,
    entity_name: str,
    note_id: str,
) -> str:
    """Return a length-bounded entity_id for a note entity.

    Home Assistant derives an object_id from the device name and the entity
    name, and a note title may be up to ``MAX_NOTE_TITLE_LENGTH`` (200)
    characters. Slugifying romanises each CJK character into several ASCII
    ones, so that object_id can run several times past the 255-character
    entity_id limit. Home Assistant truncates to 255, and that cut can land on
    an underscore -- an entity_id ``valid_entity_id`` rejects, which makes
    every state write for the note raise.

    So bound the object_id here instead. A name that fits keeps the slug Home
    Assistant's own default composition would have produced, so short-titled
    notes are named as before. A longer one is cut to the budget and given a
    short digest of the note id, which keeps it unique between notes and
    stable across restarts.

    One deliberate difference: Home Assistant composes from
    ``device.name_by_user or device.name``, while this always uses the
    category name. Renaming the category's device therefore no longer feeds
    into the entity_id of notes added afterwards -- the price of guaranteeing
    the bound without a device-registry lookup.
    """
    object_id = slugify(f"{category_name} {entity_name}")
    budget = (
        MAX_LENGTH_STATE_ENTITY_ID
        - len(entity_id_format.format(""))
        - ENTITY_ID_COLLISION_RESERVE
    )
    if len(object_id) > budget:
        digest = hashlib.sha256(note_id.encode("utf-8")).hexdigest()[
            :ENTITY_ID_HASH_LENGTH
        ]
        head = object_id[: budget - len(digest) - 1].rstrip("_")
        object_id = f"{head}_{digest}"

    return entity_id_format.format(object_id)


class HaNoteRecordEntity(Entity):
    """Base class for Ha Note Record entities.

    Provides ``has_entity_name = True`` and ``should_poll = False`` for the
    text and switch entity platforms.

    Each note category creates a device with
    ``identifiers = {(DOMAIN, category_id)}``, so every note entity that
    belongs to the same category is grouped under one device.
    """

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(
        self,
        store: HaNoteRecordStore,
        note: Note,
        category: Category,
    ) -> None:
        """Initialize the entity."""
        self._store = store
        self._note = note
        self._category = category
        self._note_exists = True

    def _apply_entity_id(self, entity_id_format: str) -> None:
        """Suggest a length-bounded entity_id to Home Assistant.

        Call after ``_attr_name`` is set: Home Assistant takes an entity_id set
        by the platform as its suggestion, so this is what bounds the object_id
        before it reaches ``async_generate_entity_id``. A note already in the
        entity registry keeps the entity_id it was given -- see
        ``async_repair_registry_entity_id`` for the ones that are unusable.
        """
        self.entity_id = note_entity_id(
            entity_id_format,
            self._category.name,
            self._attr_name or "",
            self._note.id,
        )

    @callback
    def async_repair_registry_entity_id(self, hass: HomeAssistant) -> None:
        """Rename a registry entry Home Assistant would refuse to serve.

        A note created before entity_ids were bounded left an over-long,
        invalid entity_id in the registry, and ``async_get_or_create`` hands
        that stored id straight back -- so bounding new ones is not enough on
        its own. Renaming the entry is what stops the note raising on every
        restart.
        """
        domain, object_id = self.entity_id.split(".", 1)
        ent_reg = er.async_get(hass)
        registered = ent_reg.async_get_entity_id(domain, DOMAIN, self.unique_id)
        if registered is None or valid_entity_id(registered):
            return

        repaired = ent_reg.async_generate_entity_id(domain, object_id)
        ent_reg.async_update_entity(registered, new_entity_id=repaired)
        _LOGGER.info(
            "Renamed unusable entity_id for note %s: %s", self._note.id, repaired
        )

    @property
    def note_id(self) -> str:
        """Return the note ID."""
        return self._note.id

    @property
    def available(self) -> bool:
        """Return True if the entity is available."""
        return self._note_exists and self._store.get_note(self._note.id) is not None

    @property
    def device_info(self) -> DeviceInfo:
        """Return device info."""
        return DeviceInfo(
            identifiers={(DOMAIN, device_id(AREA, self._category.id))},
            name=self._category.name,
            manufacturer="Ha Note Record",
            model="Note Category",
        )

    def _refresh_note(self) -> bool:
        """Refresh note data from store.

        Returns True if note still exists, False otherwise.
        """
        note = self._store.get_note(self._note.id)
        if note:
            self._note = note
            self._note_exists = True
            return True
        self._note_exists = False
        return False
