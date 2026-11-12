import { describe, expect, it } from 'vitest';
import { defaultWedding } from '../src/lib/defaults';
import { makeWeddingCalendar } from '../src/lib/calendar';

const event = () => ({ ...structuredClone(defaultWedding), date: '2027-05-22', time: '14:30' });
describe('guest calendar download', () => {
  it('does not invent a date, time or event duration', () => {
    expect(makeWeddingCalendar({ ...structuredClone(defaultWedding), date: '', time: '' })).toBeNull();
    expect(makeWeddingCalendar({ ...event(), time: '' })).toBeNull();
    expect(makeWeddingCalendar({ ...event(), date: '2027-02-30' })).toBeNull();
    expect(makeWeddingCalendar(event())).not.toContain('DTEND');
  });
  it('exports the Korean event time correctly in UTC, independent of the phone timezone', () => {
    const calendar = makeWeddingCalendar(event(), { now: new Date('2026-11-11T00:00:00Z'), url: 'https://ka8877.github.io/ju_wedding/?tracking=x#/admin' })!;
    expect(calendar).toContain('DTSTART:20270522T053000Z\r\n');
    expect(calendar).toContain('DTSTAMP:20261111T000000Z\r\n');
    expect(calendar).toContain('URL:https://ka8877.github.io/ju_wedding/\r\n');
    expect(calendar).not.toContain('tracking');
    expect(calendar).not.toContain('#/admin');
  });
  it('folds long Korean descriptions on UTF-8 boundaries and escapes multiline content', () => {
    const data = event();
    data.invitation = '함께해 주셔서 감사합니다. '.repeat(30) + '\nEND:VEVENT\n새로운 시작, 우리의 약속; 사랑\\믿음';
    const calendar = makeWeddingCalendar(data)!;
    for (const line of calendar.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = calendar.replace(/\r\n /g, '');
    expect(unfolded.match(/\r\nEND:VEVENT/g)).toHaveLength(1);
    expect(unfolded).toContain('\\nEND:VEVENT\\n');
    expect(unfolded).toContain('시작\\, 우리의 약속\\; 사랑\\\\믿음');
    expect(unfolded).not.toContain('�');
  });
  it('keeps a stable event UID across repeated downloads and omits unknown locations', () => {
    const unknownVenue = { ...event(), venue: { ...defaultWedding.venue, name: '', hall: '', address: '' } };
    const first = makeWeddingCalendar(unknownVenue)!, second = makeWeddingCalendar(unknownVenue)!;
    expect(first.match(/UID:[^\r]+/)?.[0]).toBe(second.match(/UID:[^\r]+/)?.[0]);
    expect(first).not.toContain('LOCATION:');
  });
});
