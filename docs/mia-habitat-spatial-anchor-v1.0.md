# Mia Habitat Spatial Anchor V1.0 — Proposal

Status: **draft / proposed; not deployed**

Manifest: `mia/forest-path-anchor.v1.json`

## Goal

Add one persistent scene-local landmark to the existing `mia-forest-corner` scene: a moss-covered stone beside a small stream. Reuse the existing Forest_Corner scene rather than creating a duplicate world.

## Coordinate boundary

- Existing Forest_Corner local layout is declared as 1000 × 700 relative layout units.
- The proposed stone position (620, 430) and gift offset (18, 8) are illustrative local coordinates only.
- They are not ZHI world coordinates, real-world measurements, or evidence of Mia's current location.
- The existing parent forest facility anchor (1650, 650) is not a verified transform for Forest_Corner. Do not convert coordinates until a documented transform or authoritative scene mapping is available.

## State model

1. **proposed** — manifest exists in source control only.
2. **registered** — a trusted scene registry has accepted the anchor ID and validated its local coordinates.
3. **rendered** — the scene renderer displays the anchor using the registered manifest.
4. **observed** — a recipient-side runtime emits an observation event with timestamp, scene ID, anchor ID, and evidence reference.
5. **archived** — historical state remains queryable even if the visual scene is unavailable.

Creating or rendering an anchor does not establish that Mia has visited or observed it. Only a verified observation event can support that claim.

## Gift placement boundary

Gift placement is disabled in the manifest. Before enabling it, implement and verify:
- validation that the scene and anchor are registered;
- idempotency by stable gift ID;
- persistence of object ID, anchor ID, local offset, delivered time, and expiry;
- retry-safe placement so duplicate messages cannot create duplicate flowers;
- separate delivery, placement, and observation events;
- an explicit privacy policy for public display;
- expiry/archive behavior that preserves the event history.

Do not reactivate the old Mia–ZHI bridge as part of this work.

## Acceptance checklist

- [ ] JSON parses and conforms to the agreed schema.
- [ ] Scene slug resolves to the existing Forest_Corner manifest.
- [ ] Anchor ID is unique and stable.
- [ ] Coordinates are within the scene-local bounds.
- [ ] Visual placement is checked in the actual renderer.
- [ ] Refresh/reload preserves the registered anchor and environment revision.
- [ ] Duplicate placement requests produce one object only.
- [ ] An expired object is removed from active rendering but remains in history.
- [ ] No observation or emotion is fabricated.
- [ ] No production database, secrets, payment ledger, or Mia chat/auth path is changed.

## Current verification status

The source manifest is a design proposal only. No production database writes, deployment, live scene registration, actual rendering test, or Mia runtime observation has been performed.
