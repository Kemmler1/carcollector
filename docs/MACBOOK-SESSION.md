# Instructions for a Claude Code session on the MacBook

Read this first. You are running on the owner's MacBook with full computer control (screen,
mouse, keyboard, browser). The job is to take the house mock-up in this repository from
"estimated from photos" to "matches the photos", using the app's own tools, and to leave the
result committed. Work carefully and visibly; the owner may be watching.

## What this project is

A 3D block-plus-detail model of a real Fijian beachfront courtyard house, built from 41 site
photos, with a web app (`web/`) that lets you orbit it, open each part, compare each photo
with the model from the same camera spot, note changes, and export the whole thing for an
image-generation model. Read `README.md`, then `web/README.md`, then skim
`docs/house-reference.md`. `docs/photo-log.md` says what each photo shows.

Coordinate system: x across the house (positive toward the BBQ/bure side), z landward
(negative toward the sea), y up, metres. Origin is the seaward-left corner of the great room.

## Setup (5 minutes)

```sh
git clone https://github.com/Kemmler1/carcollector.git   # or the renamed repo
cd carcollector
python3 -m http.server 8000
```

Open **http://localhost:8000/web/** in Chrome or Safari. The app must be served from the
repository root (it reads `../photos/` and `../docs/`). Nothing to install; three.js is
vendored.

Sanity check: the 3D view shows a house with a pool and palms, the sidebar lists ~26 parts,
and View → Photo Spots shows small orange cameras. If the page is blank, open the console.

## Task 1 — align every photo (the main job)

Each of the 41 photos has an estimated camera spot. Most are a few metres off. Fix them:

1. **Photos → Compare Photos with Model…** (or press `C`).
2. For each photo (`←`/`→` to flick):
   - Press **Overlay** (`O`). The photo sits at 50% over the 3D view at the same aspect
     ratio and lens (the photos were taken on a phone's 0.5× ultrawide; the 3D camera uses
     a matching ~85° vertical field of view — do not change that).
   - Orbit / pan / zoom the 3D view until the big features line up: the pergola beams, the
     pool edge, the door frames, the horizon. The horizon is the best first anchor; set the
     camera height to ~1.5 m by matching it.
   - Press **Save this 3D view as the photo's spot**.
   - If the photo shows something the model gets wrong (a wall in the wrong place, a
     missing window, a room that is bigger), press **Assign…** and write it in
     "What does it tell us". Do not try to fix geometry by eye in this pass — just record it.
3. When all 41 are done, open **Photos → Assign Photos…** and press
   **Download v1.json with assignments**. Replace `web/data/versions/v1.json` with the
   downloaded file. Commit:
   `git commit -am "Align camera spots for all photos" && git push`

Expect this to take an hour. Do it properly; everything downstream depends on these spots.

## Task 2 — fix the geometry the photos contradict

Using the notes you wrote in Task 1 and `docs/floor-plan-notes.md`:

- Edit `web/data/versions/v1.json` directly (it is the model). Each section has a `box`
  footprint, `openings` (doors/windows per wall side, metres from that wall's start),
  `props` (furniture relative to the box) and `trees`. `web/README.md` documents the fields.
- Reload, re-check in Overlay, repeat. Commit after each room that lines up.
- The house is symmetrical: left and right wings mirror each other. If a room is confirmed
  on one side, mirror it on the other and say so in its `description`.

Do not renumber or rename photos. Do not remove `(est.)`/`confirmed: false` markers unless
the photo actually confirms the thing.

## Task 3 — walk-through and screenshots

- **View → Walk Through** (`W`), then mouse to look, `W A S D`, `Shift` to run, `Esc` to stop.
  Walk the sea-to-entry axis and both verandahs. If you fall through something or a wall is
  missing, note it and fix it in Task 2.
- Take six screenshots for the presentation and save them in `renders/screenshots/`:
  from the sea at eye level, the pool pavilion toward the bure, inside the great room toward
  the sea, the courtyard from the entry door, the entry porch, and the plan view with roofs
  off (View → Roofs). Commit them.

## Task 4 — export round trip (only if asked)

File → Export for ChatGPT… produces one Markdown document. Paste it into ChatGPT with the
photos it names attached, ask for images of the views in `docs/prompts/`, and when it returns
the `RETURN JSON` block, File → Import Version… creates `v2`. Save the downloaded `v2.json`
into `web/data/versions/`, add it to `index.json`, put any generated images in
`renders/v2/`, and commit.

## Rules

- Commit small and often, on `main`, with messages that say what changed. Push when done.
- Never force-push. Never delete photos.
- The repo deploys to GitHub Pages on every push (`.github/workflows/pages.yml`); check the
  live site after pushing: https://kemmler1.github.io/carcollector/web/
- Don't install global tools or change system settings for this; nothing is needed.
- If something in the app is broken, fix it in `web/app.js` / `web/scene.js` / `web/style.css`
  and test in the browser before committing. Keep the macOS look of the UI.
- When you finish, write a short summary of what changed and what is still uncertain in
  `docs/SESSION-NOTES.md` (append, dated) and commit it.
