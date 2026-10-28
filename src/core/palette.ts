// A fixed 64-colour palette. Every final pixel is matched to this set in OKLab.
// Ramps are deliberately grouped so the diorama keeps one coherent identity
// through daylight, dusk, floodlights, rain and the three court surfaces.

export const PALETTE_HEX = [
  '#0a0b10', '#12141c', '#1b1f2a', '#252a36', '#303744', '#3d4652', '#4c5662', '#5e6a75',
  '#74808a', '#8d979f', '#a7b0b4', '#c2c8c7', '#d9dcd4', '#efe9d8', '#fff6e0', '#2b1d1a',
  '#3e2a22', '#56382a', '#744a32', '#94613f', '#b87e4f', '#d49b63', '#e9bb82', '#1c2a20',
  '#243a2a', '#2e4a32', '#3a5c3a', '#4c7345', '#628d4f', '#7ea75d', '#9dc273', '#c6da91',
  '#42211c', '#5e2a22', '#7e3428', '#a04430', '#bc5a38', '#d17148', '#e18e5f', '#f0af7c',
  '#172a33', '#1e3a47', '#29505e', '#35697a', '#438595', '#62a2ac', '#8cc2c0', '#b9dcd3',
  '#3a2d12', '#5c481d', '#816628', '#ad8a37', '#d6b257', '#f0d77c', '#2a2039', '#3d2b4e',
  '#563a63', '#7d5072', '#a5626c', '#d08078', '#f0a48c', '#613a2c', '#9b6448', '#d89b72',
] as const;

export const PALETTE_SIZE = 64;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Lab {
  l: number;
  a: number;
  b: number;
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function hexToRgb(hex: string): Rgb {
  const v = parseInt(hex.slice(1), 16);
  return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (c: number) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function rgbToOklab(r: number, g: number, b: number): Lab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

export function oklabToRgb(l: number, a: number, b: number): Rgb {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  const lr = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const lg = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const lb = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  return { r: linearToSrgb(lr), g: linearToSrgb(lg), b: linearToSrgb(lb) };
}

export const PALETTE_RGB: Rgb[] = PALETTE_HEX.map(hexToRgb);
export const PALETTE_LAB: Lab[] = PALETTE_RGB.map((c) => rgbToOklab(c.r, c.g, c.b));

export function nearestPalette(r: number, g: number, b: number): Rgb {
  const target = rgbToOklab(r, g, b);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PALETTE_LAB.length; i++) {
    const c = PALETTE_LAB[i];
    const dl = target.l - c.l;
    const da = target.a - c.a;
    const db = target.b - c.b;
    const dist = dl * dl + da * da + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return PALETTE_RGB[best];
}

export function createPaletteLutData(): Uint8Array<ArrayBuffer> {
  const levels = 64;
  const tiles = 8;
  const textureSize = levels * tiles;
  const data = new Uint8Array(new ArrayBuffer(textureSize * textureSize * 4));
  for (let bIndex = 0; bIndex < levels; bIndex++) {
    const tileX = bIndex % tiles;
    const tileY = Math.floor(bIndex / tiles);
    for (let gIndex = 0; gIndex < levels; gIndex++) {
      for (let rIndex = 0; rIndex < levels; rIndex++) {
        const index = nearestPaletteIndex((rIndex + 0.5) / levels, (gIndex + 0.5) / levels, (bIndex + 0.5) / levels);
        const color = PALETTE_RGB[index];
        const x = tileX * levels + rIndex;
        const y = tileY * levels + gIndex;
        const offset = (y * textureSize + x) * 4;
        data[offset] = Math.round(color.r * 255);
        data[offset + 1] = Math.round(color.g * 255);
        data[offset + 2] = Math.round(color.b * 255);
        data[offset + 3] = 255;
      }
    }
  }
  return data;
}

export function nearestPaletteIndex(r: number, g: number, b: number): number {
  const target = rgbToOklab(r, g, b);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PALETTE_LAB.length; i++) {
    const c = PALETTE_LAB[i];
    const dl = target.l - c.l;
    const da = target.a - c.a;
    const db = target.b - c.b;
    const dist = dl * dl + da * da + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

// Semantic aliases keep the world code readable while every colour still
// resolves through the same fixed palette.
export const C = {
  ink: 0,
  night: 1,
  midnight: 2,
  slate: 3,
  stone: 4,
  gunmetal: 5,
  grey: 6,
  blueGrey: 7,
  ash: 8,
  silver: 9,
  paleSilver: 10,
  lightGrey: 11,
  bone: 12,
  cream: 13,
  paper: 14,
  darkBrown: 15,
  umber: 16,
  brown: 17,
  leather: 18,
  tan: 19,
  sand: 20,
  lightSand: 21,
  paleSand: 22,
  forestDeep: 23,
  forest: 24,
  pine: 25,
  green: 26,
  moss: 27,
  grass: 28,
  grassLight: 29,
  grassPale: 30,
  grassHighlight: 31,
  brickDark: 32,
  roofDark: 33,
  roof: 34,
  clayDark: 35,
  clay: 36,
  clayMid: 37,
  clayLight: 38,
  clayPale: 39,
  clayHighlight: 40,
  hardDeep: 40,
  hardDark: 41,
  hard: 42,
  tealDark: 43,
  teal: 44,
  tealLight: 45,
  aqua: 46,
  paleAqua: 47,
  ochreDeep: 48,
  ochre: 49,
  mustardDark: 50,
  mustard: 51,
  yellow: 52,
  paleYellow: 53,
  plumDeep: 54,
  plum: 55,
  mauve: 56,
  roseDark: 57,
  rose: 58,
  salmon: 59,
  peach: 60,
  skinDark: 61,
  skinMid: 62,
  skinLight: 63,
} as const;

export function color(index: number): number {
  const v = parseInt(PALETTE_HEX[index % 64].slice(1), 16);
  return v;
}

export function hexOf(index: number): string {
  return PALETTE_HEX[index % 64];
}


