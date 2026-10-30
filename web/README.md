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
- **Compare** (Photos menu, or `C`): flick through the photos (`←` `→`) next to the 3D view from
  the photo's camera spot, or **Overlay** (`O`) at 50% to line them up. The 3D camera uses the
  4:3 frame and ~85° vertical FOV of a phone's 0.5× ultrawide lens. Orbit until it matches and
  **Save Spot**.
- **Plan** (`P`): 2D floor-plan editor, sea at the top, metres. Click a room or area to select
  it; drag to move, corner/edge handles to resize, or type x / z / w / d in the bar. Drag doors
  and windows along their wall, drag their end handles to resize, change their type in the bar;
  `+ Door / window…` then click a wall to add one. Drag furniture; `R` rotates 15° (`⇧R` back),
  `⌘D` duplicates, `⌫` deletes; `+ Item…` then click to place a new one. `+ Room` drags out a
  new rectangle. **Mirror** copies the selected room across the centre line (the house is
  symmetrical). Arrow keys nudge by one snap step. `⌘Z` undo. Snap 0.1–1 m or off. Scroll to
  zoom, shift-drag to pan. Every edit rebuilds the 3D model and is kept in the browser as a
  working copy of the version (the Plan segment shows a dot); File → Download Current Version
  JSON writes it out to commit, File → Revert Plan Edits throws it away.
- **Walk** (`W`): first-person; mouse to look, `W A S D`, `Shift` to run, `Q`/`E` for height, `Esc`.
- Mac-style menu bar (File / View / Photos / Versions / Help) with keyboard shortcuts under Help.
  Light and dark follow the system. Photos preload in the background after the model loads.
- View menu: roofs off (dollhouse view), labels, photo spots, wireframe. Plan view.

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
