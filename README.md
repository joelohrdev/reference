# Reference Studio

A browser-only painting reference tool. Upload (or drop, or paste) a photo and study it with:

- **Image**: crop to the part you will paint (with undo), flip horizontally (`F`), scroll to zoom and hold Space to pan.
- **Composition** grids: rule of thirds, golden ratio, diagonals with reciprocals, center lines, and a numbered proportion grid for grid-method transfer. A canvas-size frame (square, 4×5, 3×4, 5×7, 11×14, 2×3, 1×2, landscape or portrait) can be dragged over the photo; grids draw inside it.
- **Perspective**: a draggable eye-level line, one-, two- or three-point vanishing points with converging guide lines, and a "level the view" tool (press `L`, then drag along an edge that should be vertical).
- **Sighting tools**: find a vanishing point from two receding edges, measure the angle of any edge (in degrees and as a clock position), compare proportions against a unit length, and drop plumb and level lines through a point.
- **View as**: color, grayscale, notan (two values, automatic or with a split slider), 3 values, 5 values, line drawing (Sobel edges) and a warm/cool temperature map, with an independent squint (blur) toggle and strength, and an optional 5- or 9-step value scale beside the image.
- **Color mixer** (press `C`): sample any color from the view with the eyedropper, pick from the image's dominant palette, then see how to mix it from the paints you own, or which single watercolor paints come closest. Mixing uses a single-constant Kubelka–Munk model.
- **Library**: every image you open is kept in the browser (IndexedDB) along with its marks and settings, so a study survives a reload. Switch between images from the strip, compare two side by side, or run a pose timer that cycles through them.
- **Export**: download the current view with overlays baked in, or a contact sheet of the value views.

Images never leave the browser. Processing runs on a working copy no larger than 1600px on the long edge.

It is also a **progressive web app**: a production build registers a service worker (`public/sw.js`) that caches the app shell and static assets, so once visited the whole tool works offline, and browsers that support it offer to install it to the home screen or dock. The manifest comes from `app/manifest.ts`; icons are in `public/` and `app/apple-icon.png`. The worker is only registered in production (`npm run build && npm start`), not under `next dev`, so development never serves stale code.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Keys `1`–`6` and `8` switch views, `7` toggles squint, `L` toggles the level tool, `C` opens the color mixer, `F` flips, `+`/`-`/`0` zoom, `Esc` cancels.

## Layout

- `components/studio/Studio.tsx` – state, upload, zoom/pan, library, crop, export, keyboard shortcuts, layout.
- `components/studio/ImageLayer.tsx` – the display canvas (rotation, flip, squint).
- `components/studio/Overlay.tsx` – SVG grids, frame, perspective guides, sighting marks and the crop tool.
- `components/studio/Sidebar.tsx` – the control panel.
- `components/studio/ColorMixer.tsx` – the mixer panel and paint picker.
- `components/studio/Library.tsx`, `ValueScale.tsx` – the image strip with pose timer, and the gray scale.
- `lib/image-processing.ts` – the pixel passes behind the view modes.
- `lib/render.ts` – shared view drawing, cropping and export.
- `lib/library.ts` – IndexedDB storage for images and their settings.
- `lib/mixing.ts`, `lib/paints.ts`, `lib/color.ts`, `lib/palette.ts` – Kubelka–Munk mixing, the paint library, color conversions and dominant-color extraction.
- `lib/geometry.ts` – intersections, angles, clock positions, leveling math.
- `lib/sample-scene.ts` – a synthetic tilted street scene for trying the tools.
