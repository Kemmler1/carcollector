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
| `photos/raw/` | Source photos, numbered in the order received, named for what they show. |
| `docs/photo-log.md` | One entry per photo: camera position, what is visible, what it tells us. The evidence trail. |
| `docs/house-reference.md` | The master description: site, buildings, structure, materials, colours, fixtures, furniture, landscape. Written to be handed to another model. |
| `docs/floor-plan-notes.md` | Inferred layout, dimension estimates, and the list of things still unknown. Feeds `floorplan/`. |
| `docs/prompts/` | Image-generation prompt pack, one file per view/room. |
| `floorplan/` | Floor plan drawings (SVG/DXF) once there is enough information. |
| `web/` | Interactive 3D mock-up: orbit, click parts, photos per part, notes, export for image-gen models, import replies as new versions, diff. See `web/README.md`. |
| `photos/thumbs/` | 640 px thumbnails used by the web app. |
| `3d/` | Exported 3D model files, later. |

## Status

- 41 photos received and logged. Entry porch, courtyard and the triple bedroom now seen. More to come.
- Plan type established: courtyard house, great room to the sea, bedroom wings landward,
  continuous pergola. The landward (far) wing and the bedroom count are still unknown.
- No measurements yet. Every dimension in the docs is an estimate from photos and is marked as such.
- 3D block model v1 lives in `web/` (serve the repo root and open `/web/`). Rooms not yet
  photographed inside are marked `?`.
- Floor plan drawing not started; the model's `box` values in `web/data/versions/v1.json` are
  the current best estimate of the plan.

## Conventions

- Photos are numbered `NN-description.jpg` in order received. Never renumber.
- Dimensions: metres. Estimates are written `~3.0 m (est.)`; measured values have no qualifier.
- Compass directions are provisional until a site plan or map confirms orientation.
  Working assumption: the sea is "front". Standing in the great room facing the sea, the master
  bedroom wing is on the left and the BBQ / bure side is on the right; the mainland headland is
  to the left.
