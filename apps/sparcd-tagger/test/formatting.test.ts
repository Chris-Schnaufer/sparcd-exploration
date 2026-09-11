import { describe, it, expect } from 'vitest';
import { formatDate, formatTime, formatDateTime } from '../src/lib/formatting';

const ISO = '2026-09-11T13:24:05.000Z';

describe('formatDate', () => {
  it('renders ISO order by default', () => {
    expect(formatDate(ISO, 'iso')).toBe('2026-09-11');
  });

  it('renders US order', () => {
    expect(formatDate(ISO, 'us')).toBe('09/11/2026');
  });

  it('renders EU order', () => {
    expect(formatDate(ISO, 'eu')).toBe('11/09/2026');
  });
});

describe('formatTime', () => {
  it('renders 24-hour by default', () => {
    expect(formatTime(ISO, '24h')).toBe('13:24');
  });

  it('renders 12-hour with AM/PM', () => {
    expect(formatTime(ISO, '12h')).toBe('1:24 PM');
  });

  it('renders midnight and noon correctly in 12-hour', () => {
    expect(formatTime('2026-09-11T00:05:00.000Z', '12h')).toBe('12:05 AM');
    expect(formatTime('2026-09-11T12:05:00.000Z', '12h')).toBe('12:05 PM');
  });
});

describe('formatDateTime', () => {
  it('joins date and time per the chosen formats', () => {
    expect(formatDateTime(ISO, 'eu', '12h')).toBe('11/09/2026 1:24 PM');
  });

  it('includes seconds when asked, in both 24h and 12h', () => {
    expect(formatDateTime(ISO, 'iso', '24h', { seconds: true })).toBe('2026-09-11 13:24:05');
    expect(formatDateTime(ISO, 'iso', '12h', { seconds: true })).toBe('2026-09-11 1:24:05 PM');
  });
});
