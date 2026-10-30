# Walkthrough video — contextual map

Source: `IMG_5398.MOV` (GitHub Release `video-walkthrough-1`), 5 min 30 s, 1080p60, 0.5× lens,
portrait, shot late afternoon with the sun low from the seaward-left. One continuous take.
330 frames at 1 fps were reviewed; 50 keyframes are kept in `photos/video/` as photos 71–120
(`NNN-vSSSs-name.jpg`, SSS = seconds into the video).

Orientation used below: **sea = front**. "Left" and "right" are as seen standing in the great
room facing the sea (the same convention as the rest of the docs). The video's own route is
given in seconds so any frame can be pulled with `ffmpeg -ss <s> -i video/IMG_5398.MOV -frames:v 1`.

## Route, in order

| s | Where | What it shows |
|---|---|---|
| 0–12 | Forecourt → entry porch | Gable porch on 4 posts on rendered plinths; 3 steps; double timber doors with woven-mesh panels, "WELCOME" mat. Planter boxes of crotons both sides. |
| 13–16 | Front door → courtyard | Door opens straight onto the courtyard walkway. Courtyard planting, bikes, palms immediately ahead. |
| 17–24 | Walkway, landward side, turning **left** (toward the left wing) | Canvases on the wall; a screen door at the corner. |
| 25–40 | **Bathroom 3** (corner, landward-left) | Small: vanity with round basin on dark cabinet, toilet, mirror, louvre window, walk-in shower with glass screen, bird-of-paradise canvas, ply ceiling. Entered from the walkway via a mesh-panel door. |
| 41–55 | **Triple room A** (left wing, landward end) | Door with woven-mesh panels. Three single beds in a row, bird-of-paradise canvas over them, banana canvas on the side wall, louvre window, wall AC, ceiling fan, cathedral ply ceiling with dark trusses. Wardrobe. |
| 56–66 | Walkway, left side, heading seaward | Double **louvre doors** (a room not entered — likely the bedroom-W ensuite's second door or a store), then a mesh screen door. |
| 67–97 | **Bedroom W** (left wing, seaward) | Louvre bi-folds on the far (seaward) wall, frangipani canvas, dark four-poster with white voile, wall AC, ceiling fan. Door at the back-outer corner → **ensuite** (heliconia canvas, vanity, toilet, mirror, louvre window). Louvre bi-folds opened at 93 s. |
| 98–110 | Through the bi-folds onto the **left verandah** | Flat pergola, grey tile, rocking chairs and a low table under it, lawn beyond, pot. This is where the side verandah meets the bedroom. Back in through the bi-folds. |
| 111–117 | Bedroom W → courtyard screen door | Black chest with giant clam shell by the door; out onto the walkway. |
| 118–124 | Walkway, left side, seaward end | Yellow wheelie bin, canvases, a solid timber door (the hallway/store beside the great room). |
| 125–170 | **Bedroom E** (right wing, seaward) — reached by crossing the walkway | Mesh screen door. Dark four-poster, heliconia-on-bamboo canvas over the bed, bird-of-paradise canvas on the side wall, grey upholstered armchair, clam shell on a chest, louvre bi-folds (closed, sun streaming through) on the seaward wall, wall AC, fan. Door at the back → **ensuite** (dark until opened: walk-in shower with glass, vanity, toilet, heliconia canvas, louvre window). |
| 171–179 | Walkway, right side | Frangipani canvas, mesh screen door at the landward corner. |
| 180–190 | **Triple room B** (right wing, landward end) | Twin/triple singles, heliconia canvas, louvre window, AC. Mirror of triple room A. |
| 191–198 | Walkway, right side, back toward the sea | Closed double louvre doors (the twin of the ones on the left side), then a mesh door. |
| 199–215 | Walkway's **seaward corner → great room** | A louvre bi-fold in the great room's back wall opens straight off the walkway. Inside: TV cabinet on the back wall, frangipani canvas, carved mask, light switches. Great room beyond with the sea through the far bi-folds. |
| 216–240 | **Kitchen** | Galley: island with 1.5 sink, under-bench oven, hob, LG fridge in a nib with cupboard over, dark cabinets, sand stone tops, water cooler, ply ceiling with downlights, louvre window over the back bench. Desk with cane chair and frangipani canvas + mask at the galley's end. |
| 241–258 | Kitchen's own **side door** → walkway | A louvre bi-fold from the kitchen onto the walkway (seaward side, by the yellow bin), then back in. |
| 259–268 | **Great room** | Hip roof, dark trusses, 2 black fans, 8 cylinder pendants. 8-seat dining table with slatted chairs on the right; black leather log-leg sofas and armchairs with patterned cushions on the left; bar stools at the island. |
| 269–282 | Dining bi-folds → **BBQ verandah** (right) | Stainless hooded BBQ, two gas bottles, black pots with palms, lawn and tree line beyond. The verandah ends at **bedroom E's louvre bi-folds**, flanked by two carved masks. Outer wall of the right wing beyond: AC units on plinths, downpipes. |
| 283–295 | Pavilion from the BBQ end | The pool pavilion runs on from the verandah; sea, bean bags, loungers. Back in through the great room (dining, lounge, toward the pool). |
| 296–310 | Pavilion, left end | Bedroom W's bi-folds (closed) with the honey-board wall, the pergola's open-grid corner, the lawn, the bay and headland to the left, a stepped rafter row. |
| 311–329 | Pool, bure, lawn | Pool with blue mosaic and spa nook, bure with thatch at the far right end, white loungers on the lawn, palms, reef flat. Ends looking back at the pavilion from the south-west lawn. |

## What the video settles

1. **Entry is on the landward wing, on axis.** Front doors open directly onto the courtyard
   walkway; there is no entry hall room. (Correct `entry-hall` → delete or make it a zone.)
2. **Walkway ring is complete** and carries every bedroom door. From the front door: left
   corner = bathroom 3; left wing landward = triple room A; left wing seaward = bedroom W;
   right wing seaward = bedroom E; right wing landward = triple room B; right corner is not
   entered (mirror of bathroom 3: likely laundry / store / staff). Both long sides also have a
   pair of closed double louvre doors mid-way — most likely linen/store cupboards or the
   ensuites' second doors.
3. **Four bedrooms + ensuites confirmed in person**: W and E each have an ensuite at their
   back-outer corner; the two triple rooms share bathroom 3 (and its mirror, if that is one).
4. **The great room's back wall opens to the walkway twice**: one louvre bi-fold at the
   seaward-left corner of the walkway (by the TV cabinet) and the kitchen's own side door. The
   "hallway beside the fridge" in the earlier notes is this kitchen door; there is no separate
   corridor.
5. **Side verandahs confirmed**: each runs from the pavilion to the seaward bi-folds of the
   corner bedroom (W: rockers; E: BBQ + masks), 4–5 m wide, same flat pergola.
6. **Furniture is as modelled** with these corrections: bedroom E has the grey armchair and a
   clam-shell chest; bedroom W has the clam-shell chest too; the triple rooms each have one
   wardrobe; the desk is at the end of the kitchen galley.
7. **Art placement**: bird-of-paradise over the triple-room beds and bathroom 3; frangipani
   over bedroom W's bed and on the walkway walls; heliconia over bedroom E's bed, in both
   ensuites and in triple room B; banana leaf in triple room A and by the great room's back
   door; masks flank bedroom E's seaward doors and the kitchen desk.

## Still unknown after the video

- The landward-right corner room (mirror of bathroom 3) and both pairs of closed double
  louvre doors on the walkway's long sides.
- The landward wing's left room with the raised gable (not entered; caretaker's flat per the
  listing).
- Any measurement. The video has no narration and nothing was measured.
