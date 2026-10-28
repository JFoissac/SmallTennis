import * as THREE from 'three';
import { hexOf } from '../core/palette';
import { makeCanvasTexture, simpleRng } from './build';

const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10011', '10101', '10101', '10101', '11001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00100', '00100'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  "'": ['00100', '00100', '00000', '00000', '00000', '00000', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
};

export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: string,
  letterSpacing = 1,
): number {
  let cursor = x;
  const upper = text.toUpperCase();
  for (const ch of upper) {
    const glyph = GLYPHS[ch] ?? GLYPHS[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === '1') {
          ctx.fillStyle = color;
          ctx.fillRect(cursor + col * scale, y + row * scale, scale, scale);
        }
      }
    }
    cursor += (5 + letterSpacing) * scale;
  }
  return cursor - x - letterSpacing * scale;
}

export function pixelTextWidth(text: string, scale: number, letterSpacing = 1): number {
  return text.length * (5 + letterSpacing) * scale - letterSpacing * scale;
}

export function bannerTexture(
  text: string,
  options: { bg?: number; fg?: number; accent?: number; sub?: string; width?: number; height?: number } = {},
): THREE.CanvasTexture {
  const width = options.width ?? 512;
  const height = options.height ?? 128;
  const bg = hexOf(options.bg ?? 24);
  const fg = hexOf(options.fg ?? 13);
  const accent = hexOf(options.accent ?? 53);
  return makeCanvasTexture(width, height, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, width, 5);
    ctx.fillRect(0, height - 5, width, 5);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 5, width, 2);
    const bigScale = Math.max(2, Math.min(10, Math.floor((width - 48) / (text.length * 6))));
    const textW = pixelTextWidth(text, bigScale);
    const tx = Math.floor((width - textW) / 2);
    const ty = Math.floor(height / 2 - (7 * bigScale) / 2) + (options.sub ? -8 : 0);
    drawPixelText(ctx, text, tx + 3, ty + 3, bigScale, hexOf(0));
    drawPixelText(ctx, text, tx, ty, bigScale, fg);
    if (options.sub) {
      const small = Math.max(1, Math.floor(bigScale / 3));
      const subW = pixelTextWidth(options.sub, small);
      drawPixelText(ctx, options.sub, Math.floor((width - subW) / 2), ty + 7 * bigScale + 10, small, accent);
    }
    ctx.fillStyle = accent;
    const ballSize = Math.max(4, Math.floor(bigScale * 1.2));
    ctx.fillRect(16, Math.floor(height / 2) - ballSize / 2, ballSize, ballSize);
    ctx.fillStyle = bg;
    ctx.fillRect(16 + Math.floor(ballSize * 0.35), Math.floor(height / 2) - ballSize / 2, 1, ballSize);
    ctx.fillRect(width - 16 - ballSize, Math.floor(height / 2) - ballSize / 2, ballSize, ballSize);
  });
}

export function courtTexture(surface: 'clay' | 'grass' | 'hard'): THREE.CanvasTexture {
  const size = 128;
  const rand = simpleRng(surface === 'clay' ? 12 : surface === 'grass' ? 44 : 91);
  return makeCanvasTexture(
    size,
    size,
    (ctx) => {
      const variants =
        surface === 'clay'
          ? [35, 36, 37, 38, 39]
          : surface === 'grass'
            ? [26, 27, 28, 29, 30, 31]
            : [41, 42, 43, 44, 45, 46];
      ctx.fillStyle = hexOf(variants[Math.floor(variants.length / 2)]);
      ctx.fillRect(0, 0, size, size);

      if (surface === 'clay') {
        for (let y = 0; y < size; y += 2) {
          ctx.fillStyle = hexOf(rand() > 0.55 ? 37 : 35);
          ctx.globalAlpha = 0.25;
          ctx.fillRect(0, y + Math.floor(rand() * 2), size, 1);
        }
        ctx.globalAlpha = 1;
        for (let i = 0; i < 170; i++) {
          const c = variants[Math.floor(rand() * 3)];
          ctx.fillStyle = hexOf(c);
          ctx.globalAlpha = 0.08 + rand() * 0.16;
          const w = 1 + Math.floor(rand() * 2);
          ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), w, w);
        }
        ctx.globalAlpha = 1;
        for (let i = 0; i < 7; i++) {
          ctx.strokeStyle = hexOf(39);
          ctx.globalAlpha = 0.18;
          ctx.beginPath();
          ctx.moveTo(0, rand() * size);
          ctx.bezierCurveTo(size * 0.3, rand() * size, size * 0.7, rand() * size, size, rand() * size);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (surface === 'grass') {
        for (let x = 0; x < size; x += 16) {
          ctx.fillStyle = hexOf(Math.floor(x / 16) % 2 === 0 ? 29 : 27);
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x, 0, 16, size);
        }
        ctx.globalAlpha = 1;
        for (let i = 0; i < 700; i++) {
          ctx.fillStyle = hexOf(variants[Math.floor(rand() * variants.length)]);
          ctx.globalAlpha = 0.25 + rand() * 0.5;
          const h = 1 + Math.floor(rand() * 3);
          ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1, h);
        }
        ctx.globalAlpha = 1;
      } else {
        for (let i = 0; i < 300; i++) {
          ctx.fillStyle = hexOf(variants[Math.floor(rand() * variants.length)]);
          ctx.globalAlpha = 0.12 + rand() * 0.25;
          const w = 1 + Math.floor(rand() * 4);
          ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), w, 1);
        }
        ctx.globalAlpha = 1;
      }
    },
    { x: 3, y: 7 },
  );
}

export function grassTexture(): THREE.CanvasTexture {
  const size = 64;
  const rand = simpleRng(7);
  return makeCanvasTexture(
    size,
    size,
    (ctx) => {
      ctx.fillStyle = hexOf(28);
      ctx.fillRect(0, 0, size, size);
      const colors = [26, 27, 28, 29, 30, 31];
      for (let i = 0; i < 900; i++) {
        const c = colors[Math.floor(rand() * colors.length)];
        ctx.fillStyle = hexOf(c);
        ctx.globalAlpha = 0.25 + rand() * 0.55;
        ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1, 1 + Math.floor(rand() * 3));
      }
      ctx.globalAlpha = 1;
    },
    { x: 1, y: 1 },
  );
}

export function gravelTexture(): THREE.CanvasTexture {
  const size = 64;
  const rand = simpleRng(3);
  return makeCanvasTexture(
    size,
    size,
    (ctx) => {
      ctx.fillStyle = hexOf(21);
      ctx.fillRect(0, 0, size, size);
      const colors = [19, 20, 21, 22, 23, 17];
      for (let i = 0; i < 1100; i++) {
        ctx.fillStyle = hexOf(colors[Math.floor(rand() * colors.length)]);
        ctx.globalAlpha = 0.3 + rand() * 0.55;
        const s = rand() > 0.85 ? 2 : 1;
        ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), s, s);
      }
      ctx.globalAlpha = 1;
    },
    { x: 2, y: 2 },
  );
}

export function chainlinkTexture(): THREE.CanvasTexture {
  const size = 32;
  return makeCanvasTexture(
    size,
    size,
    (ctx) => {
      ctx.clearRect(0, 0, size, size);
      ctx.strokeStyle = hexOf(11);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size, size);
      ctx.moveTo(0, size);
      ctx.lineTo(size, 0);
      ctx.stroke();
    },
    { x: 1, y: 1 },
  );
}

export function roofTexture(): THREE.CanvasTexture {
  const size = 64;
  const rand = simpleRng(18);
  return makeCanvasTexture(
    size,
    size,
    (ctx) => {
      ctx.fillStyle = hexOf(34);
      ctx.fillRect(0, 0, size, size);
      for (let y = 0; y < size; y += 8) {
        ctx.fillStyle = hexOf(33);
        ctx.fillRect(0, y + 7, size, 1);
        for (let x = 0; x < size; x += 8) {
          ctx.fillStyle = hexOf(rand() > 0.5 ? 36 : 34);
          ctx.globalAlpha = 0.45;
          ctx.fillRect(x + (y / 8) % 2 * 4, y, 4, 7);
          ctx.fillStyle = hexOf(35);
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x + 7, y, 1, 7);
        }
        ctx.globalAlpha = 1;
      }
    },
    { x: 2, y: 3 },
  );
}

export function flagTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(64, 40, (ctx) => {
    ctx.fillStyle = hexOf(14);
    ctx.fillRect(0, 0, 64, 40);
    ctx.fillStyle = hexOf(34);
    ctx.fillRect(0, 0, 64, 11);
    ctx.fillStyle = hexOf(28);
    ctx.fillRect(0, 29, 64, 11);
    drawPixelText(ctx, 'LA', 19, 13, 2, hexOf(14));
  });
}

export interface ClockHandsTexture {
  texture: THREE.CanvasTexture;
  redraw: (date: Date) => void;
}

export function createClockTexture(): ClockHandsTexture {
  const texture = makeCanvasTexture(128, 128, (ctx) => {
    drawClock(ctx, new Date());
  });
  function drawClock(ctx: CanvasRenderingContext2D, date: Date): void {
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = hexOf(14);
    ctx.fillRect(4, 4, 120, 120);
    ctx.fillStyle = hexOf(0);
    for (let i = 0; i < 128; i++) {
      const edge = i < 4 || i > 123;
      if (edge) {
        ctx.fillRect(i, 0, 1, 128);
        ctx.fillRect(0, i, 128, 1);
      }
    }
    ctx.fillStyle = hexOf(0);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r1 = 47;
      const r2 = i % 3 === 0 ? 38 : 42;
      const x1 = 64 + Math.sin(a) * r1;
      const y1 = 64 - Math.cos(a) * r1;
      const x2 = 64 + Math.sin(a) * r2;
      const y2 = 64 - Math.cos(a) * r2;
      line(ctx, x1, y1, x2, y2, i % 3 === 0 ? 3 : 1);
    }
    const minute = date.getMinutes() + date.getSeconds() / 60;
    const hour = (date.getHours() % 12) + minute / 60;
    const second = date.getSeconds();
    drawHand(ctx, 64, 64, (hour / 12) * Math.PI * 2, 28, 4, hexOf(0));
    drawHand(ctx, 64, 64, (minute / 60) * Math.PI * 2, 40, 2, hexOf(0));
    drawHand(ctx, 64, 64, (second / 60) * Math.PI * 2, 43, 1, hexOf(36));
    ctx.fillStyle = hexOf(36);
    ctx.fillRect(62, 62, 4, 4);
  }
  return {
    texture,
    redraw: (date: Date) => {
      const ctx = texture.image.getContext('2d') as CanvasRenderingContext2D;
      drawClock(ctx, date);
      texture.needsUpdate = true;
    },
  };
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  length: number,
  thickness: number,
  color: string,
): void {
  const x = cx + Math.sin(angle) * length;
  const y = cy - Math.cos(angle) * length;
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(x, y);
  ctx.stroke();
}

function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
): void {
  ctx.fillStyle = ctx.strokeStyle;
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ctx.fillRect(Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), width, width);
  }
}

export function scoreboardTexture(lines: { label: string; value: string }[], width = 256, height = 160): THREE.CanvasTexture {
  return makeCanvasTexture(width, height, (ctx) => {
    ctx.fillStyle = hexOf(2);
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = hexOf(27);
    ctx.fillRect(0, 0, width, 6);
    for (let i = 0; i < lines.length; i++) {
      const y = 14 + i * 26;
      drawPixelText(ctx, lines[i].label, 10, y, 2, hexOf(9));
      drawPixelText(ctx, lines[i].value, width - 10 - pixelTextWidth(lines[i].value, 3), y - 3, 3, hexOf(14));
    }
  });
}

export function grungeBannerTexture(): THREE.CanvasTexture {
  return makeCanvasTexture(128, 64, (ctx) => {
    ctx.fillStyle = hexOf(13);
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = hexOf(32);
    ctx.fillRect(0, 0, 128, 5);
    ctx.fillRect(0, 59, 128, 5);
    drawPixelText(ctx, 'MEMBERS', 12, 12, 2, hexOf(0));
    drawPixelText(ctx, 'ONLY', 32, 34, 2, hexOf(36));
  });
}
