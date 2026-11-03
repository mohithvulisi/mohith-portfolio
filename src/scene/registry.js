// Scene objects the render pipeline needs to show or hide between the live
// pass and the cached-room pass. Filled by the components that own them.
export const sceneParts = {
  room: null, // everything static: shelf, books, walls, light shaft, contact shadows
  hero: null, // the portfolio volume (always live)
  dust: null, // drifting motes (always live)
  halo: null // glow around the hero spine (always live)
};
