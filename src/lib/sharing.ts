import { resolvePublicSiteUrl } from './site-url';

export const publicInvitationUrl = resolvePublicSiteUrl(import.meta.env.VITE_PUBLIC_SITE_URL);

/**
 * Every share uses the single public invitation, including local/admin previews
 * and visits through an old address. The browser's current origin is never a
 * share target. Arguments remain for existing callers of this public helper.
 */
export function invitationUrl(_href: string, _preview = false): string {
  return publicInvitationUrl;
}

type Point = readonly [number, number];

function heartOutline(scale = 1): Point[] {
  const points: Point[] = [];
  const curve = (from: Point, a: Point, b: Point, to: Point) => {
    for (let step = 0; step <= 72; step += 1) {
      const t = step / 72, u = 1 - t;
      const x = u ** 3 * from[0] + 3 * u ** 2 * t * a[0] + 3 * u * t ** 2 * b[0] + t ** 3 * to[0];
      const y = u ** 3 * from[1] + 3 * u ** 2 * t * a[1] + 3 * u * t ** 2 * b[1] + t ** 3 * to[1];
      points.push([(x - 0.5) * scale + 0.5, (y - 0.5) * scale + 0.5]);
    }
  };
  // Broad shoulders keep the entire square scan area inside the silhouette.
  curve([0.5, 0.185], [0.22, -0.035], [0.035, 0.075], [0.035, 0.335]);
  curve([0.035, 0.335], [0.035, 0.69], [0.18, 0.805], [0.5, 0.965]);
  curve([0.5, 0.965], [0.82, 0.805], [0.965, 0.69], [0.965, 0.335]);
  curve([0.965, 0.335], [0.965, 0.075], [0.78, -0.035], [0.5, 0.185]);
  return points;
}

function scanline(outline: readonly Point[], y: number): number[] {
  const intersections: number[] = [];
  for (let index = 0; index < outline.length; index += 1) {
    const a = outline[index], b = outline[(index + 1) % outline.length];
    if ((a[1] > y) !== (b[1] > y)) intersections.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
  }
  return intersections.sort((a, b) => a - b);
}

/**
 * A QR module pattern with a heart silhouette, not a square QR in a heart frame.
 * Rotating the symbol puts its finder anchors in the two shoulders
 * and lower point. Only non-functional data at the top cleft is trimmed; finder,
 * alignment, timing and format modules are always painted in full. The white
 * buffers around all three finders stay clear of the surrounding dot pattern.
 */
export async function invitationQrPixels(url: string) {
  const QRCode = await import('qrcode');
  // The short canonical link uses H correction. Longer optional payloads use
  // M before their modules become too dense for the small phone preview.
  const highCorrection = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const qr = highCorrection.modules.size > 45 ? QRCode.create(url, { errorCorrectionLevel: 'M' }) : highCorrection;
  const width = 1536, height = 1536;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const modules = qr.modules.size;
  const centerX = width / 2, centerY = height * 0.51;
  const moduleSize = width * 0.4 * Math.SQRT2 / modules;
  const cosine = -Math.SQRT1_2, sine = -Math.SQRT1_2; // 225 degrees
  const silhouette = heartOutline();
  for (let y = 0; y < height; y += 1) {
    const spans = scanline(silhouette, (y + 0.5) / height);
    for (let x = 0; x < width; x += 1) {
      const dx = x + 0.5 - centerX, dy = y + 0.5 - centerY;
      const u = (cosine * dx + sine * dy) / moduleSize + modules / 2;
      const v = (-sine * dx + cosine * dy) / moduleSize + modules / 2;
      const column = Math.floor(u), row = Math.floor(v);
      const insideSymbol = column >= 0 && column < modules && row >= 0 && row < modules;
      const reserved = insideSymbol && Boolean(qr.modules.isReserved(row, column));
      const position = (x + 0.5) / width;
      let insideHeart = false;
      for (let span = 0; span < spans.length; span += 2) {
        if (position >= spans[span] && position <= spans[span + 1]) { insideHeart = true; break; }
      }
      if (!insideHeart && !reserved) continue;
      let dark: boolean;
      if (insideSymbol) {
        dark = Boolean(qr.modules.get(row, column));
      } else {
        // These buffers extend four modules beyond each finder corner. Unlike
        // the earlier design, no square white moat separates the whole symbol
        // from the heart pattern. Its outer white canvas remains print-friendly.
        const finderBuffer = column >= -4 && column < 8 && row >= -4 && row < 8
          || column >= modules - 8 && column < modules + 4 && row >= -4 && row < 8
          || column >= -4 && column < 8 && row >= modules - 8 && row < modules + 4;
        if (finderBuffer) continue;
        const texture = (Math.imul(column + 211, 73856093) ^ Math.imul(row + 217, 19349663)) >>> 0;
        dark = texture % 100 < 54;
      }
      if (!dark) continue;
      const rounded = !reserved && (!insideSymbol || modules <= 45);
      if (rounded && (u - column - 0.5) ** 2 + (v - row - 0.5) ** 2 > 0.44 ** 2) continue;
      const offset = (y * width + x) * 4;
      pixels[offset] = 31; pixels[offset + 1] = 53; pixels[offset + 2] = 34;
    }
  }
  return { pixels, width, height };
}

export async function invitationQr(url: string): Promise<string> {
  const { pixels, width, height } = await invitationQrPixels(url);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('QR image could not be created');
  const raster = context.createImageData(width, height);
  raster.data.set(pixels); context.putImageData(raster, 0, 0);
  return canvas.toDataURL('image/png');
}
