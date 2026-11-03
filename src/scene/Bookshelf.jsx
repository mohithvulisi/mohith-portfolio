import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  InstancedBufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3
} from "three";
import { useStore } from "../store/useStore";
import { qualitySettings } from "../utils/device";
import { seeded } from "../textures/pageRenderer";
import { ATLAS_CELLS, atlasColor, renderDustSprite, renderShelfAtlas, renderWall, renderWood } from "../textures/proceduralArt";
import { BOOK, SHELF } from "./metrics";
import { sceneParts } from "./registry";

const DEPTH = 1.6;
const BOARD = 0.12;
const SIDE = 0.2;
const TOP = 5.05;
const BOTTOM = -4.25;
const HERO_GAP = [SHELF.heroSlot[0] - BOOK.totalT / 2 - 0.012, SHELF.heroSlot[0] + BOOK.totalT / 2 + 0.012];

// Lays out the decorative volumes: runs of upright books, a few leaners and
// flat stacks, leaving the hero's slot open on the middle shelf.
const layoutBooks = () => {
  const rand = seeded(4242);
  const books = [];
  const add = (x, y, t, h, d, tilt = 0, flat = false) => books.push({ x, y, t, h, d, tilt, flat, cell: Math.floor(rand() * ATLAS_CELLS) });

  SHELF.boardTops.forEach((boardTop, row) => {
    SHELF.bays.forEach(([x0, x1], bay) => {
      const heroRow = row === 1 && bay === 1;
      let x = x0 + 0.04 + (heroRow ? 0 : rand() * 0.9);
      const runEnd = heroRow ? 2.9 : x + 2.2 + rand() * 1.6;
      let count = 0;
      while (x < Math.min(runEnd, x1 - 0.3)) {
        const t = 0.15 + rand() * 0.17;
        if (heroRow && x + t > HERO_GAP[0] && x < HERO_GAP[1]) {
          x = HERO_GAP[1];
          continue;
        }
        const h = 1.5 + rand() * 0.72;
        add(x + t / 2, boardTop, t, h, 1.12 + rand() * 0.3);
        x += t + (rand() > 0.85 ? 0.01 : 0.002);
        count += 1;
      }
      // a leaner closes most runs, resting its top against the last upright
      if (!heroRow && count && rand() > 0.3 && x < x1 - 0.6) {
        const t = 0.2;
        const h = 1.55 + rand() * 0.25;
        const tilt = 0.16 + rand() * 0.1;
        add(x + (h / 2) * Math.sin(tilt) + (t / 2) * Math.cos(tilt) + 0.01, boardTop, t, h, 1.25, tilt);
        x += h * Math.sin(tilt) + t + 0.45;
      }
      // a flat stack further along
      if (rand() > 0.35 && x < x1 - 1.6) {
        const stack = 2 + Math.floor(rand() * 3);
        let y = boardTop;
        const sx = x + 0.4 + rand() * 0.4;
        for (let i = 0; i < stack; i += 1) {
          const t = 0.13 + rand() * 0.09;
          const h = 1.45 + rand() * 0.4;
          add(sx + h / 2 + (rand() - 0.5) * 0.08, y, t, h, 1.1 + rand() * 0.2, 0, true);
          y += t;
        }
      }
    });
  });
  return books;
};

const BOOK_VERTEX_HEAD = `
  attribute float aCell;
  attribute vec3 aCover;
  varying float vCell;
  varying vec3 vCover;
  varying vec3 vObjNormal;
`;

const BOOK_FRAGMENT_HEAD = `
  uniform float uCells;
  varying float vCell;
  varying vec3 vCover;
  varying vec3 vObjNormal;
`;

const createBookMaterial = (atlas) => {
  const material = new MeshStandardMaterial({ map: atlas, roughness: 0.78, metalness: 0.02 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCells = { value: ATLAS_CELLS };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${BOOK_VERTEX_HEAD}`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCell = aCell;\nvCover = aCover;\nvObjNormal = normal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${BOOK_FRAGMENT_HEAD}`)
      .replace(
        "#include <map_fragment>",
        `vec4 spine = texture2D( map, vec2( ( vCell + vMapUv.x ) / uCells, vMapUv.y ) );
         vec3 pages = vec3( 0.5, 0.45, 0.37 ) * ( 0.88 + 0.12 * step( 0.5, fract( vMapUv.x * 90.0 ) ) );
         vec3 base = vObjNormal.z > 0.5 ? spine.rgb : ( abs( vObjNormal.y ) > 0.5 ? pages : vCover );
         diffuseColor.rgb *= base;`
      );
  };
  material.customProgramCacheKey = () => "shelf-books";
  return material;
};

const SHAFT_VERTEX = `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const SHAFT_FRAGMENT = `
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    float facing = abs(dot(vNormalView, vViewDir));
    float along = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
    float flicker = 0.92 + 0.08 * sin(uTime * 0.6 + vUv.y * 5.0);
    float a = pow(facing, 2.2) * along * uOpacity * flicker;
    gl_FragColor = vec4(vec3(1.0, 0.82, 0.58) * a, a);
  }
`;

const DUST_VERTEX = `
  uniform float uTime;
  uniform float uSize;
  attribute float aSeed;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float t = uTime * (0.04 + aSeed * 0.05);
    p.x += sin(t * 6.2831 + aSeed * 40.0) * 0.18;
    p.y += mod(-t * 0.6 + aSeed * 8.0, 1.0) * 0.6 - 0.3;
    p.z += cos(t * 5.0 + aSeed * 23.0) * 0.14;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.4 + aSeed) / -mv.z;
    vAlpha = 0.35 + 0.65 * fract(aSeed * 13.7);
  }
`;

const DUST_FRAGMENT = `
  uniform sampler2D uSprite;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec4 s = texture2D(uSprite, gl_PointCoord);
    float a = s.a * vAlpha * uOpacity;
    gl_FragColor = vec4(s.rgb * a, a);
  }
`;

// Light shaft from a high window, upper left, falling across the shelf.
const SHAFT_FROM = new Vector3(-6.5, 9.5, 5.5);
const SHAFT_TO = new Vector3(1.4, -2.2, -1.2);

const shaftTransform = () => {
  const dir = new Vector3().subVectors(SHAFT_TO, SHAFT_FROM);
  const length = dir.length();
  const mid = new Vector3().addVectors(SHAFT_FROM, SHAFT_TO).multiplyScalar(0.5);
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), dir.clone().normalize());
  return { length, mid, quaternion, dir: dir.normalize() };
};

const Dust = ({ count }) => {
  const { geometry, uniforms } = useMemo(() => {
    const rand = seeded(99);
    const { length, dir } = shaftTransform();
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const side = new Vector3(1, 0, 0).cross(dir).normalize();
    const up = new Vector3().crossVectors(dir, side).normalize();
    for (let i = 0; i < count; i += 1) {
      const along = 0.25 + rand() * 0.7;
      const radius = (0.35 + along * 1.5) * Math.sqrt(rand());
      const angle = rand() * Math.PI * 2;
      const p = SHAFT_FROM.clone()
        .addScaledVector(dir, along * length)
        .addScaledVector(side, Math.cos(angle) * radius)
        .addScaledVector(up, Math.sin(angle) * radius);
      positions.set([p.x, p.y, p.z], i * 3);
      seeds[i] = rand();
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("aSeed", new BufferAttribute(seeds, 1));
    const sprite = new CanvasTexture(renderDustSprite());
    return {
      geometry: g,
      uniforms: { uTime: { value: 0 }, uSize: { value: 38 }, uSprite: { value: sprite }, uOpacity: { value: 0.55 } }
    };
  }, [count]);

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
  });

  const points = useRef();
  useEffect(() => {
    sceneParts.dust = points.current;
    return () => {
      sceneParts.dust = null;
    };
  }, []);

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={DUST_VERTEX}
        fragmentShader={DUST_FRAGMENT}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
};

const LightShaft = () => {
  const { length, mid, quaternion } = useMemo(shaftTransform, []);
  const uniforms = useMemo(() => ({ uOpacity: { value: 0.3 }, uTime: { value: 0 } }), []);
  const geometry = useMemo(() => new CylinderGeometry(2.1, 0.45, length, 40, 1, true), [length]);
  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <mesh geometry={geometry} position={mid} quaternion={quaternion} renderOrder={5}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={SHAFT_VERTEX}
        fragmentShader={SHAFT_FRAGMENT}
        transparent
        depthWrite={false}
        side={DoubleSide}
        blending={AdditiveBlending}
      />
    </mesh>
  );
};

const woodTexture = (repeatX, repeatY, seed) => {
  const texture = new CanvasTexture(renderWood(1024, 256, seed));
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  return texture;
};

export function Bookshelf() {
  const quality = useStore((s) => s.quality);
  const settings = qualitySettings(quality);
  const booksRef = useRef();
  const roomRef = useRef();

  useEffect(() => {
    sceneParts.room = roomRef.current;
    return () => {
      sceneParts.room = null;
    };
  }, []);

  const books = useMemo(layoutBooks, []);
  const assets = useMemo(() => {
    const atlas = new CanvasTexture(renderShelfAtlas());
    atlas.colorSpace = SRGBColorSpace;
    atlas.anisotropy = 8;
    const wall = new CanvasTexture(renderWall());
    wall.colorSpace = SRGBColorSpace;
    wall.wrapS = RepeatWrapping;
    wall.wrapT = RepeatWrapping;
    wall.repeat.set(10, 5);
    const geometry = new BoxGeometry(1, 1, 1);
    geometry.setAttribute("aCell", new InstancedBufferAttribute(new Float32Array(books.map((b) => b.cell)), 1));
    const covers = new Float32Array(books.length * 3);
    const color = new Color();
    books.forEach((b, i) => {
      color.set(atlasColor(b.cell)).convertSRGBToLinear();
      covers.set([color.r, color.g, color.b], i * 3);
    });
    geometry.setAttribute("aCover", new InstancedBufferAttribute(covers, 3));
    return {
      geometry,
      bookMaterial: createBookMaterial(atlas),
      wood: new MeshStandardMaterial({ map: woodTexture(3, 1, 3), roughness: 0.62, color: "#c9a990" }),
      woodSide: new MeshStandardMaterial({ map: woodTexture(1, 4, 5), roughness: 0.66, color: "#b8957c" }),
      backPanel: new MeshStandardMaterial({ map: woodTexture(4, 6, 8), roughness: 0.8, color: "#6e5544" }),
      wall: new MeshStandardMaterial({ map: wall, roughness: 0.95 }),
      floor: new MeshStandardMaterial({ map: woodTexture(6, 10, 11), roughness: 0.5, color: "#7d6150" }),
      brass: new MeshStandardMaterial({ color: "#a8823e", metalness: 0.9, roughness: 0.32 })
    };
  }, [books]);

  useLayoutEffect(() => {
    const mesh = booksRef.current;
    const matrix = new Matrix4();
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    const euler = new Euler();
    books.forEach((b, i) => {
      const zFront = SHELF.front - 0.04 - (i % 5) * 0.012;
      if (b.flat) {
        euler.set(0, 0, Math.PI / 2);
        position.set(b.x, b.y + b.t / 2, zFront - b.d / 2);
        scale.set(b.t, b.h, b.d);
      } else {
        euler.set(0, 0, b.tilt);
        position.set(b.x, b.y + (b.h / 2) * Math.cos(b.tilt) + (b.t / 2) * Math.abs(Math.sin(b.tilt)), zFront - b.d / 2);
        scale.set(b.t, b.h, b.d);
      }
      quaternion.setFromEuler(euler);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [books]);

  const width = SHELF.bays[1][1] - SHELF.bays[0][0] + SIDE * 2;
  const centreX = (SHELF.bays[0][0] + SHELF.bays[1][1]) / 2;
  const zMid = SHELF.front - DEPTH / 2;
  const height = TOP - BOTTOM;
  const boards = [BOTTOM + 0.3, ...SHELF.boardTops, TOP - 0.1];
  const uprights = [SHELF.bays[0][0] - SIDE / 2, (SHELF.bays[0][1] + SHELF.bays[1][0]) / 2, SHELF.bays[1][1] + SIDE / 2];

  // static room: rendered once per viewpoint by the pipeline (see Effects.jsx)
  return (
    <group>
      <group ref={roomRef}>
        <mesh position={[0, 2, SHELF.front - DEPTH - 0.12]} material={assets.wall} receiveShadow>
          <planeGeometry args={[60, 30]} />
        </mesh>
        <mesh position={[0, BOTTOM, 4]} rotation={[-Math.PI / 2, 0, 0]} material={assets.floor} receiveShadow>
          <planeGeometry args={[60, 24]} />
        </mesh>

        <mesh position={[centreX, (TOP + BOTTOM) / 2, SHELF.front - DEPTH + 0.02]} material={assets.backPanel} receiveShadow>
          <boxGeometry args={[width, height, 0.04]} />
        </mesh>
        {boards.map((y, i) => (
          <mesh key={`board-${i}`} position={[centreX, y - BOARD / 2, zMid]} material={assets.wood} castShadow receiveShadow>
            <boxGeometry args={[width, BOARD, DEPTH]} />
          </mesh>
        ))}
        {uprights.map((x, i) => (
          <mesh key={`upright-${i}`} position={[x, (TOP + BOTTOM) / 2, zMid]} material={assets.woodSide} castShadow receiveShadow>
            <boxGeometry args={[SIDE, height, DEPTH]} />
          </mesh>
        ))}
        <mesh position={[centreX, TOP + 0.08, zMid + 0.04]} material={assets.wood} castShadow receiveShadow>
          <boxGeometry args={[width + 0.3, 0.16, DEPTH + 0.15]} />
        </mesh>

        {[
          [-1.15, SHELF.boardTops[1]],
          [3.6, SHELF.boardTops[2]],
          [-3.0, SHELF.boardTops[0]]
        ].map(([x, y], i) => (
          <group key={`end-${i}`} position={[x, y, SHELF.front - 0.6]}>
            <mesh position={[0, 0.45, 0]} material={assets.brass} castShadow>
              <boxGeometry args={[0.04, 0.9, 0.55]} />
            </mesh>
            <mesh position={[0.2, 0.02, 0]} material={assets.brass}>
              <boxGeometry args={[0.4, 0.04, 0.55]} />
            </mesh>
          </group>
        ))}

        <instancedMesh ref={booksRef} args={[assets.geometry, assets.bookMaterial, books.length]} castShadow receiveShadow />

        {settings.shadows &&
          SHELF.boardTops.map((y, i) => (
            <ContactShadows
              key={`shadow-${i}`}
              frames={1}
              position={[centreX, y + 0.002, zMid]}
              scale={[width, DEPTH]}
              resolution={512}
              far={2.4}
              blur={2.2}
              opacity={0.75}
              color="#0a0604"
            />
          ))}

        <LightShaft />
      </group>
      <Dust count={settings.dust} />
    </group>
  );
}
