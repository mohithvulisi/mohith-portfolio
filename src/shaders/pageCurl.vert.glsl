// Page curl for a right-bound (manga) leaf, spliced into MeshLambertMaterial.
//
// The leaf is modelled as a curve in the x/z plane, parameterised by arc length
// s from the spine (s = 0) to the free edge (s = uWidth). Its tangent angle is
//   a(s) = a0                         for s <= s0  (flat part near the spine)
//   a(s) = a0 + k (s - s0)            for s >  s0  (rolling cylinder, radius 1/|k|)
// where a = 0 lies flat on the left stack and a = PI lies flat on the right.
// Integrating the unit tangent t(a) = (-cos a, sin a) gives the exact position,
// so the page never stretches. Both a0 and the edge angle are clamped to
// [0, PI]; a curve whose tangent turns by less than PI cannot cross itself and
// never dips below its pivot, so no self-intersection.
//
// A resting page also curves down into the gutter. That curve only bends the
// normals (uBulge): the camera sees the spread face-on, so the curve reads
// through light and shade while the stacks stay exactly where they are.

uniform float uProgress;  // 0 = resting on the left stack, 1 = resting on the right
uniform float uBend;      // signed lead (+) or lag (-) of the free edge, radians
uniform float uRadius;    // tightest allowed curl radius (paper stiffness)
uniform float uCurlStart; // s0: distance from the spine where the curl begins
uniform float uWidth;
uniform float uHeight;
uniform float uTwist;     // corner-first lift, radians at the top corner
uniform float uPivotZ;    // height of the hinge above the book's base
uniform float uBulge;     // gutter curvature at rest, radians (sign = which side it rests on)
varying float vLeafU;     // 0 at the spine, 1 at the free edge

const float LEAF_PI = 3.141592653589793;

vec2 leafPoint(float s, float a0, float k, float s0) {
  float flatLen = min(s, s0);
  vec2 p = flatLen * vec2(-cos(a0), sin(a0));
  float c = max(s - s0, 0.0);
  if (abs(k) < 1e-4) {
    p += c * vec2(-cos(a0), sin(a0));
  } else {
    float a1 = a0 + k * c;
    p += vec2(-(sin(a1) - sin(a0)) / k, (cos(a0) - cos(a1)) / k);
  }
  return p;
}

void pageCurl(vec3 position, out vec3 curled, out vec3 curledNormal) {
  float s = clamp(-position.x, 0.0, uWidth);
  float yN = clamp(position.y / uHeight, -0.5, 0.5);
  float theta = uProgress * LEAF_PI;
  float twist = uTwist * yN * sin(theta);

  float spineA = clamp(theta - 0.5 * uBend + 0.35 * twist, 0.0, LEAF_PI);
  float edgeA = clamp(theta + 0.5 * uBend + twist, 0.0, LEAF_PI);
  float curlLen = max(uWidth - uCurlStart, 1e-3);
  float k = clamp((edgeA - spineA) / curlLen, -1.0 / uRadius, 1.0 / uRadius);

  vec2 xz = leafPoint(s, spineA, k, uCurlStart);
  float a = spineA + k * max(s - uCurlStart, 0.0);

  // gutter: the page rises out of the binding over the first fifth of its width
  float gutter = max(0.0, 1.0 - s / (uWidth * 0.22));
  float shadeA = a + uBulge * cos(theta) * gutter * gutter;

  curled = vec3(xz.x, position.y, xz.y + uPivotZ);
  // rotate the flat normal (0, 0, 1) about +Y by the local tangent angle
  curledNormal = vec3(sin(shadeA), 0.0, cos(shadeA));
  vLeafU = s / uWidth;
}
