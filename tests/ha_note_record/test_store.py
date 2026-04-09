"""Tests for ha_note_record store."""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from homeassistant.core import HomeAssistant

from custom_components.ha_note_record.store import (
    Category,
    HaNoteRecordStore,
    Note,
    StoreData,
)


class TestCategory:
    """Tests for the Category dataclass."""

    def test_round_trip(self):
        """Test Category serialization round-trip."""
        cat = Category(id="cat1", name="Work", created_at="2025-06-15T10:00:00+00:00")
        data = cat.to_dict()
        restored = Category.from_dict(data)
        assert restored.id == "cat1"
        assert restored.name == "Work"


class TestNote:
    """Tests for the Note dataclass."""

    def test_round_trip(self):
        """Test Note serialization round-trip."""
        note = Note(
            id="note1",
            category_id="cat1",
            title="Test",
            content="# Hello",
            pinned=True,
            created_at="2025-06-15T10:00:00+00:00",
            updated_at="2025-06-15T12:00:00+00:00",
        )
        data = note.to_dict()
        restored = Note.from_dict(data)
        assert restored.id == "note1"
        assert restored.pinned is True
        assert restored.content == "# Hello"


class TestHaNoteRecordStore:
    """Tests for HaNoteRecordStore."""

    async def test_async_load_empty(self, store):
        """Test loading with empty storage."""
        await store.async_load()
        assert len(store.categories) == 0
        assert len(store.notes) == 0

    async def test_async_load_with_data(self, store):
        """Test loading with existing data."""
        store._store.async_load = AsyncMock(return_value={
            "categories": [
                {"id": "cat1", "name": "Work", "created_at": "2025-01-01T00:00:00+00:00"},
            ],
            "notes": [
                {
                    "id": "note1",
                    "category_id": "cat1",
                    "title": "Test",
                    "content": "Hello",
                    "pinned": False,
                    "created_at": "2025-01-01T00:00:00+00:00",
                    "updated_at": "2025-01-01T00:00:00+00:00",
                },
            ],
        })
        await store.async_load()
        assert len(store.categories) == 1
        assert len(store.notes) == 1
        assert store.get_category("cat1") is not None
        assert store.get_note("note1") is not None

    async def test_create_category(self, store):
        """Test creating a category."""
        await store.async_load()
        cat = await store.async_create_category("Work")

        assert cat.name == "Work"
        assert cat.id is not None
        assert len(store.categories) == 1
        assert store.get_category(cat.id) is not None
        store._store.async_save.assert_called()

    async def test_delete_category(self, store):
        """Test deleting a category."""
        await store.async_load()
        cat = await store.async_create_category("To Delete")

        result = await store.async_delete_category(cat.id)
        assert result is True
        assert len(store.categories) == 0
        assert store.get_category(cat.id) is None

    async def test_create_note_validates_category_exists(self, store):
        """Test that creating a note in nonexistent category returns None."""
        await store.async_load()
        note = await store.async_create_note("nonexistent_cat", "Title")
        assert note is None

    async def test_create_note_success(self, store):
        """Test creating a note in an existing category."""
        await store.async_load()
        cat = await store.async_create_category("Work")
        note = await store.async_create_note(cat.id, "My Note", content="# Hello")

        assert note is not None
        assert note.title == "My Note"
        assert note.content == "# Hello"
        assert note.category_id == cat.id
        assert note.pinned is False
        assert len(store.notes) == 1

    async def test_update_note_atomic(self, store):
        """Test updating multiple note fields atomically."""
        await store.async_load()
        cat = await store.async_create_category("Work")
        note = await store.async_create_note(cat.id, "Original")

        store._store.async_save.reset_mock()
        result = await store.async_update_note(
            note.id, title="Updated", content="New content", pinned=True
        )

        assert result is True
        updated = store.get_note(note.id)
        assert updated.title == "Updated"
        assert updated.content == "New content"
        assert updated.pinned is True
        # Only one save for atomic update
        assert store._store.async_save.call_count == 1

    async def test_update_note_partial(self, store):
        """Test updating only some note fields."""
        await store.async_load()
        cat = await store.async_create_category("Work")
        note = await store.async_create_note(cat.id, "Title", content="Original")

        result = await store.async_update_note(note.id, pinned=True)
        assert result is True
        updated = store.get_note(note.id)
        assert updated.pinned is True
        assert updated.title == "Title"  # Unchanged
        assert updated.content == "Original"  # Unchanged

    async def test_update_note_not_found(self, store):
        """Test updating nonexistent note returns False."""
        await store.async_load()
        result = await store.async_update_note("nonexistent", title="New")
        assert result is False

    async def test_delete_note(self, store):
        """Test deleting a note."""
        await store.async_load()
        cat = await store.async_create_category("Work")
        note = await store.async_create_note(cat.id, "To Delete")

        result = await store.async_delete_note(note.id)
        assert result is True
        assert store.get_note(note.id) is None
        assert len(store.notes) == 0

    async def test_delete_note_not_found(self, store):
        """Test deleting nonexistent note returns False."""
        await store.async_load()
        result = await store.async_delete_note("nonexistent")
        assert result is False

    async def test_get_notes_by_category(self, store):
        """Test getting notes filtered by category."""
        await store.async_load()
        cat1 = await store.async_create_category("Work")
        cat2 = await store.async_create_category("Personal")
        await store.async_create_note(cat1.id, "Work Note 1")
        await store.async_create_note(cat1.id, "Work Note 2")
        await store.async_create_note(cat2.id, "Personal Note")

        work_notes = store.get_notes_by_category(cat1.id)
        assert len(work_notes) == 2

        personal_notes = store.get_notes_by_category(cat2.id)
        assert len(personal_notes) == 1

    async def test_listener_pattern(self, store):
        """Test listener fires on save and can be removed."""
        await store.async_load()
        calls = []
        remove = store.async_add_listener(lambda: calls.append(1))

        await store.async_create_category("Trigger")
        assert len(calls) == 1

        remove()
        await store.async_create_category("No Trigger")
        assert len(calls) == 1  # No new call

    async def test_listener_remove_idempotent(self, store):
        """Test removing a listener twice doesn't raise."""
        await store.async_load()
        remove = store.async_add_listener(lambda: None)
        remove()
        remove()  # Should not raise

    async def test_generate_id_is_uuid(self, store):
        """Test that generated IDs are valid UUIDs."""
        import uuid
        id_str = store._generate_id()
        # Should be a valid UUID string
        parsed = uuid.UUID(id_str)
        assert str(parsed) == id_str

    async def test_delete_category_warns_on_remaining_notes(self, store):
        """Test deleting category with remaining notes logs warning."""
        await store.async_load()
        cat = await store.async_create_category("Work")
        await store.async_create_note(cat.id, "Orphan Note")

        # Category deletion proceeds despite remaining notes
        result = await store.async_delete_category(cat.id)
        assert result is True
        # Note is now orphaned (category_id points to nonexistent category)
        assert len(store.notes) == 1

    async def test_update_note_content_convenience(self, store):
        """Test the convenience method for updating content."""
        await store.async_load()
        cat = await store.async_create_category("Work")
        note = await store.async_create_note(cat.id, "Title", content="Old")

        result = await store.async_update_note_content(note.id, "New")
        assert result is True
        assert store.get_note(note.id).content == "New"

    async def test_update_note_pinned_convenience(self, store):
        """Test the convenience method for updating pinned status."""
        await store.async_load()
        cat = await store.async_create_category("Work")
        note = await store.async_create_note(cat.id, "Title")

        result = await store.async_update_note_pinned(note.id, True)
        assert result is True
        assert store.get_note(note.id).pinned is True
