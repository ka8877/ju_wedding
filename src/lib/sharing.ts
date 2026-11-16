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
 * A real heart-shaped raster with an untouched square QR in the middle.
 * The four-module white quiet zone is part of the raster, never a CSS margin.
 * Transparent outer corners let the saved PNG retain the heart silhouette.
 */
export async function invitationQrPixels(url: string) {
  const QRCode = await import('qrcode');
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const width = 1024, height = 1024, quietZone = 4;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const outside = heartOutline(), inside = heartOutline(0.972);
  for (let y = 0; y < height; y += 1) {
    const outerSpans = scanline(outside, (y + 0.5) / height);
    const innerSpans = scanline(inside, (y + 0.5) / height);
    for (let span = 0; span < outerSpans.length; span += 2) {
      const left = Math.max(0, Math.ceil(outerSpans[span] * width));
      const right = Math.min(width, Math.floor(outerSpans[span + 1] * width));
      for (let x = left; x < right; x += 1) {
        const inner = innerSpans.some((edge, index) => index % 2 === 0 && x / width >= edge && x / width <= innerSpans[index + 1]);
        const offset = (y * width + x) * 4;
        // Ivory paper with a restrained rose wash, framed in sage.
        const rose = Math.max(0, (x / width + y / height - 0.8) / 1.1);
        pixels[offset] = inner ? Math.round(251 - rose * 7) : 131;
        pixels[offset + 1] = inner ? Math.round(248 - rose * 15) : 151;
        pixels[offset + 2] = inner ? Math.round(237 - rose * 7) : 114;
        pixels[offset + 3] = 255;
      }
    }
  }
  const fill = (left: number, top: number, size: number, color: readonly number[]) => {
    for (let y = top; y < top + size; y += 1) {
      for (let x = left; x < left + size; x += 1) pixels.set(color, (y * width + x) * 4);
    }
  };
  // Whole-pixel modules are sharp at print resolution. The scan square stays
  // safely above the tapered point and below the heart's central notch.
  const moduleSize = Math.floor(560 / (qr.modules.size + quietZone * 2));
  const qrSize = moduleSize * (qr.modules.size + quietZone * 2);
  const left = Math.floor((width - qrSize) / 2), top = 234;
  fill(left, top, qrSize, [255, 255, 255, 255]);
  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let column = 0; column < qr.modules.size; column += 1) {
      if (qr.modules.get(row, column)) fill(left + (column + quietZone) * moduleSize, top + (row + quietZone) * moduleSize, moduleSize, [24, 33, 25, 255]);
    }
  }
  // A small rose heart at the tip gives the exported image its own keepsake detail.
  const accent = heartOutline();
  for (let y = 0; y < 54; y += 1) {
    const spans = scanline(accent, (y + 0.5) / 54);
    for (let span = 0; span < spans.length; span += 2) {
      for (let x = Math.ceil(spans[span] * 58); x < Math.floor(spans[span + 1] * 58); x += 1) {
        pixels.set([193, 139, 140, 255], ((858 + y) * width + 483 + x) * 4);
      }
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
