// Physical proportions of the volume, in scene units (1 unit ~ 8.7 cm).

const pageW = 1.3;
const pageH = 2.0;
const coverT = 0.022;
const blockT = 0.17;

export const BOOK = {
  pageW,
  pageH,
  coverW: pageW + 0.03,
  coverH: pageH + 0.05,
  coverT,
  blockT,
  spineT: 0.014,
  totalT: blockT + coverT * 2
};

// Where the hero volume lives on the shelf and where it is inspected.
export const SHELF = {
  front: -0.6, // z of the shelf's front edge
  heroSlot: [0.85, 0.83], // x, y of the hero book's centre on the middle shelf
  boardTops: [-2.82, -0.2, 2.42],
  bays: [
    [-5.15, -0.3],
    [-0.1, 4.75]
  ]
};
