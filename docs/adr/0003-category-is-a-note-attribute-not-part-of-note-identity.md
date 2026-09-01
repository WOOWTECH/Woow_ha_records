---
status: accepted
---

# Category is a Note attribute, not part of Note identity

A Note could not move between Categories. Nothing moved one — not a service,
not the store, not a WebSocket command — and the obstacle was never a missing
field. Category was load-bearing in three separate places in a Note's identity:
the entity `unique_id` was `unique_id(AREA, category.id, note.id, suffix)`, the
Category *was* the device those entities attached to, and `note_entity_id()`
composed the object_id from the Category name. A move was therefore an identity
change, not a data change, and no amount of store work would have made it one.

The same glossary concept was already settled the other way one Area over. In
`asset`, the device is per-Asset — `device_id(AREA, asset_id)` — the unique_id
is `unique_id(AREA, asset.id, field)`, and Category is an ordinary field on the
record. `asset_update_asset` moves an Asset by writing that field. Two Areas
held two incompatible answers to what a Category *is*, and only one of them
supported the operation users expect of a folder.

This ADR settles it: **Category is an attribute of a Note, the same as it is of
an Asset.** The entity `unique_id` becomes `unique_id(AREA, note.id, suffix)`
and carries no Category. The Category remains the device the Note's entities are
grouped under — that grouping is worth keeping, and it is exactly the part that
a move re-points.

## Considered options

**Migrating the registry inside the move**, keeping the `unique_id` shape and
rewriting both entries every time a Note changes Category, was the option that
touched fewest files. It was rejected because it buys the operation without
fixing the belief that makes the operation hard. Identity would still encode
Category, so every future path that relocates a Note — a merge, an import, a
bulk re-file — pays the same rewrite again, and each one gets its own chance to
half-fail and leave a Note split across two Categories. It also leaves the
`asset`/`note` asymmetry standing, which is the actual defect: one word, two
meanings, and no way to tell which one applies without reading the entity code.

**Renaming the entity_id on a move**, so a relocated Note stops naming the
Category it left, was rejected on the same grounds ADR-0001 used for
compatibility layers, in reverse. A rename is silent and total: every automation,
dashboard card and history query holding the old entity_id breaks at once, with
no error at the moment of breakage and nothing pointing back at the move that
caused it. The truthfulness gained is not worth an unannounced break of every
reference a user has built.

**Leaving the Category name in the object_id and accepting stale entity_ids**
was rejected because it is permanent. A Note moved out of `Work` would answer to
`text.work_shopping_list` for the rest of its life, and the integration would be
shipping identifiers it knows to be wrong. The problem is not that the snapshot
goes stale on a move; it is that the Category was in the object_id at all.

**Writing a one-time `unique_id` migration** for Notes created before this
change was considered and declined, on the evidence ADR-0001 used and on
evidence re-gathered for this decision: the repository is public with zero stars,
zero forks and zero watchers; v2.0.0 is a week old; the fourteen-day traffic is
234 clones against 43 CI runs of roughly five checkout jobs each, and 74 views
from three unique visitors. The only known installation holds test fixtures its
owner is willing to re-enter. ADR-0001's evidence has not expired, so this
follows its precedent: no migration code, and the beneficiary would have been
nobody.

## Consequences

`note_entity_id()` composes the object_id from the entity name alone. A Note
created after this change is `text.shopping_list`, not `text.work_shopping_list`.
Nothing about it can go stale, because nothing in it names a Category. Home
Assistant never regenerates an entity_id already in the registry, so every
existing Note keeps the entity_id it has and no reference breaks on upgrade.

Two Notes with the same title in different Categories now produce the same
object_id, and Home Assistant disambiguates the second with a `_2` suffix. The
duplicate-title check is per-Category and stays that way, so this is reachable
by ordinary use rather than an edge case. `ENTITY_ID_COLLISION_RESERVE` already
withholds ten characters from the object_id budget for exactly this, so the
suffix never forces a truncation. Dropping the Category name also returns its
length to that budget, which raises the title length at which a Note's
object_id is hash-truncated — #12's bound still holds, with more room under it.

Notes created before this change orphan. Their entities registered under
`note_<category>_<note>_<suffix>` and now register under `note_<note>_<suffix>`,
so Home Assistant creates fresh registry entries and the old ones remain as
unavailable entities until the user removes them. This is the cost of declining
the migration and it is accepted knowingly, on the installed-base evidence
above. It is called out in the release notes, where the instruction is to delete
the integration's stale entities once after upgrading.

Moving a Note re-points its entities at the destination Category's device
through the entity registry, because Home Assistant reads `device_info` once
when an entity is added and never again. The destination device is created if
the Category had no Notes yet. The source Category keeps its device even when
the move empties it — the Category still exists, and only deleting a Category
removes its device.

`note_update_note` and `woow_ha_records/note/update_note` gain an optional
`category_id`. Omitting it leaves the Category unchanged, consistent with every
other field on both surfaces. A destination that does not exist raises
`note.category_not_found` and changes nothing, closing the gap that
`asset_update_asset` still has — it applies `category_id` without checking the
Category exists, which is a defect of its own and is filed separately.

The duplicate-title check on an update now runs against the destination
Category, not the current one. Moving a Note into a Category that already holds
a Note of the same title is refused with `note.title_duplicate`, which is the
same rule `note_create_note` enforces and the same wording.
