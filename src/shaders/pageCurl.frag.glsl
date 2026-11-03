// Two-sided leaf shading: the front face shows `map`, the back face shows
// uBackMap mirrored (its spine sits on the opposite edge once flipped).
// Adds the gutter shadow, ink showing through from the reverse page, the soft
// shadow a turning leaf casts on the page beneath, and hover highlights.

uniform sampler2D uBackMap;
uniform vec4 uHighlightFront; // x, y (from top), w, h in page space; w = 0 disables
uniform vec4 uHighlightBack;
uniform vec3 uHighlightColor;
uniform float uHighlightAmount;
uniform vec4 uTurnShadow;     // x: side (-1 left, +1 right), y: edge (0..1 from spine), z: strength, w: softness
uniform float uRestSide;      // side this page rests on, 0 while it is in the air
varying float vLeafU;

float rectDistance(vec2 pageUv, vec4 rect) {
  vec2 halfSize = rect.zw * 0.5;
  vec2 d = abs(pageUv - (rect.xy + halfSize)) - halfSize;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float highlightMask(vec2 pageUv, vec4 rect) {
  if (rect.z <= 0.0) return 0.0;
  float d = rectDistance(pageUv, rect);
  float fill = (1.0 - step(0.0, d)) * 0.1;
  float ring = 1.0 - smoothstep(0.0015, 0.0055, abs(d - 0.005));
  return fill + ring * 0.85;
}

// Shadow of a leaf in the air on a page resting below it: covers the page from
// the spine out to where the leaf's free edge hangs, densest near the binding.
float turnShadow() {
  if (uRestSide == 0.0 || uRestSide != uTurnShadow.x || uTurnShadow.z <= 0.0) return 0.0;
  float cover = 1.0 - smoothstep(uTurnShadow.y - uTurnShadow.w, uTurnShadow.y + uTurnShadow.w, vLeafU);
  return cover * uTurnShadow.z * (0.55 + 0.45 * (1.0 - vLeafU));
}
