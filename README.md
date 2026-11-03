# Developer Chronicles, Vol. 01

An interactive 3D portfolio for **Mohith Sai Vulisi**, built as a manga volume (tankōbon) on a library shelf. Take the glowing green book, open it, and read it right to left.

Vite · React 18 · React Three Fiber · drei · GSAP · Zustand · Tailwind. No backend; every texture, sound and illustration is generated in code from the content file and the photos in `public/assets`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npm run preview    # serve dist/ locally
```

Node 18+.

## Deploy

- **Vercel:** import the repo; it detects Vite. Build `npm run build`, output `dist`.
- **Netlify:** build command `npm run build`, publish directory `dist`.
- Any static host works: upload the contents of `dist/`.

## Add to the book (edit `src/content/portfolio.js` only)

1. **Project:** add `{ title: "Name", note: "optional" }` to the right year's `projects`.
2. **Hackathon:** add `{ name: "Event", note: "optional" }` to `hackathons`.
3. **Certificate:** add `{ name: "Course", issuer: "optional", certificateUrl: "optional" }` to `certificates`.
4. **New year:** push `{ label: "3rd year", projects: [ ... ] }` onto `years`; its "to be continued" teaser disappears by itself.
5. Optional per item: `description`, `stack: []`, `repoUrl`, `liveUrl`, `images: []`. Pages, table of contents, page numbers and page count all re-flow on their own.

Photos and the cover reel live in `public/assets` and are listed under `media` in the same file. Remove any entry and that panel falls back to procedural ink art.

## Reading controls

| | Mouse / trackpad | Touch | Keyboard |
|---|---|---|---|
| Take the book | click the glowing spine | tap | Enter |
| Open | click the cover | tap | Enter |
| Next page | click the left page, or drag its edge right (hovering the edge lifts the corner) | swipe right | ← |
| Previous page | click the right page | swipe left | → |
| Jump | a chapter in the contents, or click/drag the fore-edge strip at the bottom | tap | Tab to it, Enter; arrows on the strip |
| Step back | | | Esc |

Reading progresses right to left like a printed manga: the right-hand page comes first, and each leaf lifts from the left stack and lands on the right. Portrait screens show one page at a time and pan right → left before turning.

"Plain version" (top right) shows the same content as an ordinary accessible page. Browsers without WebGL get it automatically.

## How it is put together

```
src/content/portfolio.js   the only file to edit
src/content/layout.js      turns the arrays into pages, spreads and the table of contents
src/store/useStore.js      finite state machine (illegal transitions are ignored) + animated values
src/scene/director.js      every GSAP timeline: dolly, open, turns, log-staggered jumps, rewind
src/scene/HeroBook.jsx     covers, leaves, paper blocks, picking, drag/swipe/pinch, glow, reel
src/scene/Leaf.jsx         page material: curl shader spliced into MeshStandardMaterial
src/shaders/pageCurl.*     exact arc-length curl (no stretching, no self-intersection)
src/scene/CameraRig.jsx    P(s) = lerp + arc·sin(πs), T(s) = lerp; lookAt, never Euler tweens
src/scene/Bookshelf.jsx    shelf, 54 instanced books on one atlas, light shaft, dust
src/scene/Effects.jsx      the render pipeline: cached room, reprojection, focus pull, adaptive resolution
src/textures/              canvas manga renderer, cover/spine art, sliding-window texture cache
src/audio/sfx.js           Web Audio foley (paper, cover, stamps) with panning and room reverb
src/ui/                    HUD, fore-edge navigator, plain version, cursor
```

### Why it runs at 60 fps on integrated graphics

The library never changes, so it is not redrawn. On load it is rendered once per viewpoint (on the shelf, and in front of it) into a colour + depth texture, with soft shadow maps that would be too expensive to draw every frame. Each frame paints that capture on a single quad, reprojected through the plane of the shelf so mouse sway, page pans and pinch zoom stay correct, and writes its depth so the live book and dust are still hidden behind the shelf where they should be. Only the book, its glow and the dust are drawn for real. The room goes live only while the camera flies between viewpoints, at reduced resolution.

Depth of field is a blurred copy of the near capture, so the focus pull on arrival is a crossfade. The glow around the spine is an additive halo rather than a bloom pass, tone mapping (AgX) happens in the renderer, and grain and vignette are CSS layers. Measured on integrated graphics at 2000×1125: 71 ms per frame before, about 8 ms on the shelf and 12 ms while reading after.

Photos are inked and the first spreads uploaded behind the loader; later pages render in idle time and wait while a page is turning, so a turn never stalls. If the frame rate drops, only the canvas resolution adapts; textures are never rebuilt.

The spine's pulse follows `I(t) = 1.8 + 2.4(1 + sin ωt)/2`, with ω easing between 3.2 and 6.4 rad/s on hover.

## Known limitations

- The leaves are modelled as thick slabs so the volume has a believable spine; with a small page count each turn moves a visible step of paper.
- Clicks and hovers are resolved on the resting page planes, so a page cannot be clicked while it is mid-turn.
- Pages render on the client the first time a spread comes near; on a slow phone a far jump can show plain paper for a moment before the ink lands.
- The cached room is reprojected through one plane, so very large camera moves would show it as flat; the only large move (the flight to and from the shelf) renders the room live instead.
- The live hero book is not in the room captures, so on the shelf it does not cast a spot-light shadow onto its neighbours.
- Page art uses Google Fonts. Offline, the canvas falls back to system fonts.
- Turning very fast lets several curling leaves overlap briefly in the air.
