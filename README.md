# Beachfront House — Mock-up Project

Reference pack and working files for recreating a tropical beachfront house: a timber open-air
living pavilion joined to a rendered masonry bedroom wing, with an infinity pool and a thatched
bure (gazebo) on a lawn that drops to a reef flat. Fijian-style construction.

The goal is a complete, accurate description of the real house (every material, dimension,
fixture and view), precise enough to:

1. draw a measured floor plan,
2. build a 3D model, and
3. hand a prompt pack to image-generation models that reproduces the house faithfully.

## Layout

| Path | What it holds |
|---|---|
| `photos/raw/` | Source photos, numbered in the order received, named for what they show. 42–70 are from the sales listing (prefix `listing-`). |
| `docs/photo-log.md` | One entry per photo: camera position, what is visible, what it tells us. The evidence trail. |
| `docs/house-reference.md` | The master description: site, buildings, structure, materials, colours, fixtures, furniture, landscape. Written to be handed to another model. |
| `docs/floor-plan-notes.md` | Inferred layout, dimension estimates, and the list of things still unknown. Feeds `floorplan/`. |
| `docs/prompts/` | Image-generation prompt pack, one file per view/room. |
| `floorplan/` | Floor plan drawings (SVG/DXF) once there is enough information. |
| `web/` | Interactive 3D mock-up: orbit, click parts, photos per part, notes, export for image-gen models, import replies as new versions, diff. See `web/README.md`. |
| `photos/thumbs/` | 640 px thumbnails used by the web app. |
| `3d/` | Exported 3D model files, later. |

## Status

- 70 photos logged: 41 site photos plus 29 from the sales listing (photos 42–70, including two
  aerials, 43 and 44, that fix the roof plan). A walkthrough video is expected later.
- Listing facts (Bayleys #5000383, 5 Musket Cove, Malolo Island, Fiji): 4 bedrooms, 3 bathrooms
  (two ensuites), 1 living area, pool, 5,455 m² land, self-contained caretaker's accommodation.
- Plan established (revision 3): great room under a compact hip roof in the middle of one big flat
  pergola roof that wraps it on three sides (pool pavilion + two side verandahs) and rings the
  courtyard; master bedroom and bedroom 2 sit behind the two side verandahs and open seaward onto
  them; two long hip-roofed wings run landward either side of the courtyard; a landward wing holds
  the entry, a probable caretaker's flat and the third bathroom.
- No measurements yet. Every dimension in the docs is an estimate from photos and is marked as such.
- 3D model `v2` lives in `web/` (serve the repo root and open `/web/`). `v1` is kept for the diff.
  Rooms not yet photographed inside are marked `?`.
- Floor plan drawing not started; the `box` values in `web/data/versions/v2.json` are the current
  best estimate of the plan (editable in the app's Plan view).

## Conventions

- Photos are numbered `NN-description.jpg` in order received. Never renumber.
- Dimensions: metres. Estimates are written `~3.0 m (est.)`; measured values have no qualifier.
- Compass directions are provisional until a site plan or map confirms orientation.
  Working assumption: the sea is "front". Standing in the great room facing the sea, the master
  bedroom wing is on the left and the BBQ / pool / bure side is on the right; the mainland
  headland and the bay are to the left. The aerials (43, 44) show the house on a low headland
  with the reef flat in front and the bay on the left.
- Listing: https://www.bayleys.co.nz/listings/residential/south-pacific-islands/fiji/5-musket-cove-malolo-island-5000383
