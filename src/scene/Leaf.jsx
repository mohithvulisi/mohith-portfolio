import { CanvasTexture, Color, DoubleSide, MeshLambertMaterial, PlaneGeometry, RepeatWrapping, Vector2, Vector4 } from "three";
import curlVertex from "../shaders/pageCurl.vert.glsl?raw";
import curlFragment from "../shaders/pageCurl.frag.glsl?raw";
import { makeCanvas, seeded } from "../textures/pageRenderer";
import { heightToNormal } from "../textures/proceduralArt";
import { BOOK } from "./metrics";

// One subdivided plane shared by every leaf: x runs from -width (free edge) to
// 0 (spine), so the vertex shader can read arc length straight from -x.
export const createLeafGeometry = () => {
  const geometry = new PlaneGeometry(BOOK.pageW, BOOK.pageH, 72, 6);
  geometry.translate(-BOOK.pageW / 2, 0, 0);
  return geometry;
};

const HIGHLIGHT = new Color("#2ee59a");
export const GUTTER_BULGE = 0.24;

// Tileable paper fibre: short strands at random angles over fine tooth.
let paperGrain = null;
const createPaperGrain = () => {
  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rand = seeded(311);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i += 1) {
    ctx.fillStyle = `rgba(${rand() > 0.5 ? "255,255,255" : "0,0,0"},${0.04 + rand() * 0.06})`;
    ctx.fillRect(rand() * size, rand() * size, 1, 1);
  }
  ctx.lineCap = "round";
  for (let i = 0; i < 420; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI;
    const len = 4 + rand() * 14;
    ctx.strokeStyle = `rgba(${rand() > 0.4 ? "255,255,255" : "0,0,0"},${0.08 + rand() * 0.1})`;
    ctx.lineWidth = 0.6 + rand() * 0.8;
    // draw wrapped so the tile repeats seamlessly
    [-size, 0, size].forEach((ox) =>
      [-size, 0, size].forEach((oy) => {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        ctx.stroke();
      })
    );
  }
  const texture = new CanvasTexture(heightToNormal(canvas, 1.4));
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(4, 6);
  return texture;
};

// MeshLambertMaterial (paper is matte, and Lambert is far cheaper per pixel
// than PBR) with the curl spliced into its shaders.
export const createPageMaterial = (blank, { bulge = GUTTER_BULGE } = {}) => {
  paperGrain ??= createPaperGrain();
  const uniforms = {
    uProgress: { value: 0 },
    uBend: { value: 0 },
    uRadius: { value: 0.32 },
    uCurlStart: { value: BOOK.pageW * 0.18 },
    uWidth: { value: BOOK.pageW },
    uHeight: { value: BOOK.pageH },
    uTwist: { value: 0.16 },
    uPivotZ: { value: 0 },
    uBulge: { value: bulge },
    uBackMap: { value: blank },
    uHighlightFront: { value: new Vector4(0, 0, 0, 0) },
    uHighlightBack: { value: new Vector4(0, 0, 0, 0) },
    uHighlightColor: { value: HIGHLIGHT },
    uHighlightAmount: { value: 0 },
    uTurnShadow: { value: new Vector4(0, 0, 0, 0.08) },
    uRestSide: { value: 0 }
  };
  const material = new MeshLambertMaterial({
    map: blank,
    side: DoubleSide,
    normalMap: paperGrain,
    normalScale: new Vector2(0.22, 0.22)
  });
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${curlVertex}`)
      .replace(
        "#include <beginnormal_vertex>",
        `vec3 curledPosition;
         vec3 curledNormal;
         pageCurl(position, curledPosition, curledNormal);
         vec3 objectNormal = curledNormal;`
      )
      .replace("#include <begin_vertex>", "vec3 transformed = curledPosition;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${curlFragment}`)
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
           vec4 frontTexel = texture2D( map, vMapUv );
           vec4 backTexel = texture2D( uBackMap, vec2( 1.0 - vMapUv.x, vMapUv.y ) );
           vec3 reverseInk = gl_FrontFacing ? backTexel.rgb : frontTexel.rgb;
           diffuseColor *= gl_FrontFacing ? frontTexel : backTexel;
           // ink on the other side of the sheet shows through, faintly and mirrored
           diffuseColor.rgb *= 1.0 - ( 1.0 - dot( reverseInk, vec3( 0.299, 0.587, 0.114 ) ) ) * 0.06;
         #endif
         float gutterShade = mix( 0.6, 1.0, smoothstep( 0.0, 0.18, vLeafU ) );
         float foreEdge = mix( 0.9, 1.0, smoothstep( 1.0, 0.965, vLeafU ) );
         diffuseColor.rgb *= gutterShade * foreEdge * ( 1.0 - turnShadow() );`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         #ifdef USE_MAP
           vec2 frontPage = vec2( vMapUv.x, 1.0 - vMapUv.y );
           vec2 backPage = vec2( 1.0 - vMapUv.x, 1.0 - vMapUv.y );
           float glow = gl_FrontFacing ? highlightMask( frontPage, uHighlightFront ) : highlightMask( backPage, uHighlightBack );
           totalEmissiveRadiance += uHighlightColor * glow * uHighlightAmount;
         #endif`
      );
  };
  material.customProgramCacheKey = () => "manga-page-curl-v2";
  return material;
};

// A printed page: a leaf, or the inside of a cover. The shader moves the
// vertices, so the CPU bounding sphere is meaningless and culling is off.
export const Leaf = ({ geometry, material, position }) => (
  <mesh geometry={geometry} material={material} position={position} frustumCulled={false} />
);
