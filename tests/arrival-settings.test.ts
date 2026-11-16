import { describe, expect, it } from 'vitest';
import { defaultWedding } from '../src/lib/defaults';
import { normalizeWedding, sameWeddingContent } from '../src/lib/validation';

describe('invitation arrival and cover preferences', () => {
  it('upgrades existing invitations without changing their chosen photo or music', () => {
    const legacy = JSON.parse(JSON.stringify(defaultWedding));
    legacy.coverPhoto = 'https://example.test/our-wedding.webp';
    delete legacy.design.coverStyle;
    delete legacy.guestFeatures.opening;
    delete legacy.guestFeatures.music.trackId;
    const data = normalizeWedding(legacy);
    expect(data.coverPhoto).toBe(legacy.coverPhoto);
    expect(data.design.coverStyle).toBe('auto');
    expect(data.guestFeatures.music.trackId).toBe('little-waltz');
    expect(data.guestFeatures.opening.enabled).toBe(true);
  });

  it('keeps selected music, illustration and disabled opening after a save roundtrip', () => {
    const data = structuredClone(defaultWedding);
    data.coverPhoto = 'https://example.test/our-wedding.webp';
    data.design.coverStyle = 'garden';
    data.guestFeatures.music.trackId = 'garden-party';
    data.guestFeatures.opening.enabled = false;
    const restored = normalizeWedding(JSON.parse(JSON.stringify(data)));
    expect(sameWeddingContent(restored, data)).toBe(true);
    expect(restored.coverPhoto).toBe(data.coverPhoto);
    expect(restored.guestFeatures.opening.enabled).toBe(false);
  });

  it.each([
    { design: { coverStyle: 'unknown' } },
    { guestFeatures: { music: { trackId: 'unknown' } } },
    { guestFeatures: { opening: { enabled: 'yes' } } },
  ])('rejects invalid arrival preferences instead of silently changing them', patch => {
    const data = structuredClone(defaultWedding);
    const raw = { ...data, ...patch,
      design: { ...data.design, ...patch.design },
      guestFeatures: { ...data.guestFeatures, ...patch.guestFeatures,
        music: { ...data.guestFeatures.music, ...patch.guestFeatures?.music },
        opening: { ...data.guestFeatures.opening, ...patch.guestFeatures?.opening },
      },
    };
    expect(() => normalizeWedding(raw)).toThrow();
  });
});
