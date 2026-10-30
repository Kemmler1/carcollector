# Web mock-up

Interactive 3D block model of the house, driven entirely by `data/versions/*.json`. No build
step; plain ES modules with three.js vendored in `vendor/`.

## Run it

Serve the **repository root** (the app reads `../photos/` and `../docs/`):

```sh
cd carcollector
python3 -m http.server 8000
# open http://localhost:8000/web/
```

Or publish with GitHub Pages (Settings → Pages → branch `main`, folder `/ (root)`) and open
`https://<user>.github.io/carcollector/web/`.

## What it does

- **Orbit / zoom / pan** the model; click any part, or pick it in the left list, to open its
  panel: description, materials, furniture, the photos that show it (click to enlarge), and
  its notes.
- **Notes** are the change requests: per section, plus "whole-house" notes. Mark them done
  or delete them. They are stored in the browser (localStorage) per version.
- **Export for ChatGPT** builds one Markdown document: instructions, every open note, the
  master description from `docs/house-reference.md`, every section in detail with photo
  filenames, the coordinate system, the JSON schema to reply with, and the current model
  JSON. Copy it (or download it) and attach the named photos from `photos/raw/`.
- **Import version** takes the JSON the model replies with, merges it over the current
  version (only changed/added sections need to be in it; `"remove": true` drops one), saves
  it in the browser as `v2`, `v3`, … and downloads `vN.json`. The scene rebuilds from it.
- **Diff vs previous** lists what changed between a version and the one it was based on,
  field by field, plus the image prompts the model reported using.
- **Assign photos** (onboarding): steps through every photo in `data/photos.json`. For each one,
  tick the parts it shows, write what it tells us (materials, fittings, anything the model is
  missing), and place the camera: click where the photo was taken from, then what it looks at.
  Camera spots appear as small orange cameras in the 3D view; click one to see the photo,
  then "Look from this spot" to put the 3D camera there. All of it is saved in the browser
  and "Download v1.json with assignments" gives you the version file to commit.
- Toggles: wireframe, roofs off (dollhouse view), labels, photo spots. Top view.

## Version control

Browser-saved versions are only on that machine. To make a version permanent, drop the
downloaded `vN.json` into `web/data/versions/`, add its filename to `index.json`, and commit.
Generated images for a version go in `renders/vN/` (create it) and are referenced from the
section's `photos` list or from `imagePrompts`.

## Hosting

Pushing to `main` runs `.github/workflows/pages.yml`, which enables GitHub Pages on first run
and deploys the repository root. The app is then at `https://<user>.github.io/carcollector/web/`.

## Model data

`data/versions/v1.json` → `sections[]`. Each section has an `id`, `kind` (`room`, `zone`,
`pergola`, `porch`, `pool`, `bure`, `garden`, `ground`, `water`), a `box` footprint
`{x, z, w, d}` in metres, optional `wallHeight`, `roof {type, height}`, `colors`,
`openSides` (for rooms: `sea`, `land`, `left`, `right` become post-and-beam openings),
`openings` (doors and windows along a wall side, metres from that wall's start),
`props` (furniture placed relative to the box), `trees`, `description`, `materials`,
`furniture`, `photos`, and `confirmed` (false = not photographed
inside, drawn with a `?`). Coordinates: x across the house, z landward (sea is negative z),
y up; origin at the seaward-left corner of the great room.
