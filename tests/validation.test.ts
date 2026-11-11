import { describe, expect, it } from 'vitest';
import { defaultWedding } from '../src/lib/defaults';
import { isWeddingData, publicationErrors, publicImageUrl } from '../src/lib/validation';

describe('publishing a real invitation', () => {
  it('allows incomplete drafts but prevents sharing invented or missing event details', () => {
    expect(isWeddingData(defaultWedding)).toBe(true);
    expect(publicationErrors(defaultWedding)).toHaveLength(3);
  });
  it('accepts a complete event and rejects an impossible calendar date', () => {
    const d = structuredClone(defaultWedding);
    d.date = '2027-02-28'; d.time = '14:00'; d.venue.name = '테스트 예식장'; d.venue.address = '테스트 주소';
    expect(publicationErrors(d)).toEqual([]);
    d.date = '2027-02-30';
    expect(publicationErrors(d).join(' ')).toContain('날짜');
  });
  it('requires complete accounts so guests do not receive unusable transfer details', () => {
    const d = structuredClone(defaultWedding);
    d.accounts = [{ id: '1', side: 'bride', holder: '권주영', bank: '테스트은행', number: '' }];
    expect(publicationErrors(d).join(' ')).toContain('계좌');
  });
});
describe('data arriving from persistence', () => {
  it('rejects unsupported document versions, invalid map coordinates and malformed records', () => {
    expect(isWeddingData({ ...defaultWedding, version: 2 })).toBe(false);
    expect(isWeddingData({ ...defaultWedding, venue: { ...defaultWedding.venue, lat: 91 } })).toBe(false);
    expect(isWeddingData({ ...defaultWedding, photos: [null] })).toBe(false);
  });
  it('accepts HTTPS and encoded raster photos but rejects executable URLs and SVG data', () => {
    expect(publicImageUrl('https://example.com/photo.webp')).toBe(true);
    expect(publicImageUrl('data:image/webp;base64,YWJj')).toBe(true);
    for (const url of ['javascript:alert(1)', 'http://example.com/photo.jpg', 'data:image/svg+xml;base64,PHN2Zz4=']) expect(publicImageUrl(url)).toBe(false);
  });
});
