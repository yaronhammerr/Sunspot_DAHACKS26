// An illustrative cloud texture driven by regional cloud percentages, not a
// satellite image or a prediction of individual cloud shapes/positions.
export type CloudSample = { x: number; y: number; cover: number | null };
export type CloudField = { xs: number[]; ys: number[]; values: (number | null)[][] };

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (a: number, b: number, n: number) => { const t = clamp((n - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const hash = (x: number, y: number) => {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return mix(mix(hash(ix, iy), hash(ix + 1, iy), u), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), u), v);
}

export function cloudField(samples: CloudSample[]): CloudField {
  const xs = [...new Set(samples.map(s => s.x))].sort((a, b) => a - b);
  const ys = [...new Set(samples.map(s => s.y))].sort((a, b) => a - b);
  const values = ys.map(() => xs.map(() => null as number | null));
  for (const s of samples) values[ys.indexOf(s.y)][xs.indexOf(s.x)] = s.cover !== null && Number.isFinite(s.cover) ? clamp(s.cover / 100) : null;
  return { xs, ys, values };
}

function interval(axis: number[], value: number) {
  let i = 0;
  while (i < axis.length - 2 && value > axis[i + 1]) i++;
  return [i, clamp((value - axis[i]) / (axis[i + 1] - axis[i]))] as const;
}

// Interpolate regional percentages, with a soft boundary and transparent gaps
// for missing data. This removes the hard rectangles between sample cells.
export function cloudCoverAt(field: CloudField, x: number, y: number) {
  const { xs, ys, values } = field;
  if (xs.length < 2 || ys.length < 2) return 0;
  const dx = (xs[1] - xs[0]) / 2, dy = (ys[1] - ys[0]) / 2;
  const edge = smooth(xs[0] - dx, xs[0], x) * (1 - smooth(xs.at(-1)!, xs.at(-1)! + dx, x))
    * smooth(ys[0] - dy, ys[0], y) * (1 - smooth(ys.at(-1)!, ys.at(-1)! + dy, y));
  if (!edge) return 0;
  const [col, u] = interval(xs, x), [row, v] = interval(ys, y);
  return edge * mix(mix(values[row][col] ?? 0, values[row][col + 1] ?? 0, u), mix(values[row + 1][col] ?? 0, values[row + 1][col + 1] ?? 0, u), v);
}

export type CloudRasterOptions = { width: number; height: number; left: number; top: number; worldPerPixel: number; field: CloudField };
export function renderCloudTexture({ width, height, left, top, worldPerPixel, field }: CloudRasterOptions) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const x = left + (col + .5) * worldPerPixel, y = top + (row + .5) * worldPerPixel;
    const cover = cloudCoverAt(field, x, y);
    if (cover <= 0) continue;
    // World-anchored billows and wisps stay still when the map pans. The
    // contours deliberately do not move with time: wind is not in this model.
    const nx = x * 84, ny = y * 84;
    const warp = noise(nx * .43 + 31, ny * .43 - 19);
    const broad = noise(nx + warp * 1.8, ny + warp * 1.2);
    const detail = noise(nx * 2.13 - 14, ny * 2.13 + 9);
    const fine = noise(nx * 4.37 + 7, ny * 4.37 - 23);
    const shape = broad * .64 + detail * .25 + fine * .11;
    const density = smooth(.81 - cover * .57, .98 - cover * .57, shape);
    const alpha = Math.sqrt(cover) * density * (.55 + broad * .3);
    if (!alpha) continue;
    // Light tops, cooler gray undersides and feathered transparent edges.
    const light = Math.round(191 + broad * 48 + fine * 10);
    const i = (row * width + col) * 4;
    pixels[i] = light; pixels[i + 1] = light + 2; pixels[i + 2] = light + 4;
    pixels[i + 3] = Math.round(alpha * 255);
  }
  return pixels;
}

// Soft texture needs fewer pixels than map labels. Bound the work on large
// displays and redraw only for changed data/camera, not on every sun fade.
export function cloudRasterSize(width: number, height: number) {
  const scale = Math.min(.2, 320 / Math.max(1, width), Math.sqrt(65_536 / Math.max(1, width * height)));
  return { width: Math.max(1, Math.ceil(width * scale)), height: Math.max(1, Math.ceil(height * scale)) };
}
