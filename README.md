# PropFlow Walkthrough

A browser-only prototype inspired by SnapTour-style real estate ads: upload property photos, optionally add a floor plan, arrange the room order, preview a connected camera path, and export a walkthrough-style WebM video.

## Features

- Multi-photo upload via file picker or drag/drop
- Optional floor plan upload for the mini route overlay
- Editable room labels inferred from filenames
- Reorderable walkthrough stops
- Live canvas preview with room-to-room doorway transitions
- Output presets: 16:9 listing video, 9:16 reels, 1:1 feed
- Camera motion presets: smooth, cinematic, fast social cut
- Browser-side WebM export with `canvas.captureStream()` + `MediaRecorder`
- No backend; photos stay in the user's browser session

## Local development

```bash
npm install
npm run dev
npm run build
```

## Notes

This is a working browser prototype, not a photogrammetry/3D reconstruction system. It simulates a connected walkthrough by combining uploaded still photos, floor-plan/path overlays, camera pans, and doorway-style transitions. A production version could add true floor-plan calibration, depth estimation, room matching, cloud rendering, agent/team accounts, and branded templates.
