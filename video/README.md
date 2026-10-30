# Walkthrough video

The raw walkthrough video is too large for a git push (GitHub's limit is 100 MB per file), so it
is attached to a GitHub Release instead of being committed. The local copy lives at the repo root
as `IMG_5398.MOV` and is git-ignored.

| | |
|---|---|
| File | `IMG_5398.MOV` |
| Release | https://github.com/Kemmler1/carcollector/releases/tag/video-walkthrough-1 |
| Direct URL | https://github.com/Kemmler1/carcollector/releases/download/video-walkthrough-1/IMG_5398.MOV |
| Size | 684,135,943 bytes (684 MB) |
| MD5 | `da1ac336c0cafd30c841317078ad7435` |
| Video | HEVC, 1080 × 1920 (portrait), ~16.3 Mbit/s, 329.9 s (5 min 30 s) |
| Audio | AAC |
| Shot | 2026-10-30 |

## Get it

```sh
gh release download video-walkthrough-1 -R Kemmler1/carcollector -p IMG_5398.MOV -D video/
```

or without `gh`:

```sh
curl -L -o video/IMG_5398.MOV https://github.com/Kemmler1/carcollector/releases/download/video-walkthrough-1/IMG_5398.MOV
```

## Pull frames

Not done yet. One frame per second as JPEGs, numbered, for a frame-by-frame pass:

```sh
mkdir -p video/frames
ffmpeg -i video/IMG_5398.MOV -vf "fps=1,scale=-2:1080" -q:v 3 video/frames/f%04d.jpg
```

(The clip is portrait; `scale=-2:1080` keeps it 608 × 1080. Drop `scale` for full size.)
Frames worth keeping for the record go to `photos/raw/` as new numbered photos (71 onward) and get
logged in `docs/photo-log.md` like the others; the rest stay out of git.
