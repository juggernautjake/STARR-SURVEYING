import { describe, it, expect } from 'vitest';
import { formatJobAddress, hasJobLocation, jobMapsUrl, telHref } from '@/lib/jobs/location';

describe('formatJobAddress', () => {
  it('joins the parts into one line', () => {
    expect(formatJobAddress({ address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' }))
      .toBe('123 Main St, Austin, TX 78701');
  });
  it('drops missing parts cleanly', () => {
    expect(formatJobAddress({ address: '5 Oak Rd', city: '', state: 'TX', zip: '' })).toBe('5 Oak Rd, TX');
    expect(formatJobAddress({ city: 'Waco', state: 'TX' })).toBe('Waco, TX');
    expect(formatJobAddress({})).toBe('');
  });
});

describe('jobMapsUrl', () => {
  it('prefers exact coordinates when present', () => {
    const url = jobMapsUrl({ latitude: 30.2672, longitude: -97.7431, address: '123 Main St', city: 'Austin' });
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=30.2672%2C-97.7431');
  });
  it('falls back to the formatted address when no coordinates', () => {
    const url = jobMapsUrl({ address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' });
    expect(url).toContain('destination=123%20Main%20St%2C%20Austin%2C%20TX%2078701');
  });
  it('coerces string coordinates', () => {
    expect(jobMapsUrl({ latitude: '30.2', longitude: '-97.7' })).toContain('destination=30.2%2C-97.7');
  });
  it('is empty when there is nothing to route to', () => {
    expect(jobMapsUrl({})).toBe('');
    expect(jobMapsUrl({ latitude: null, longitude: null, address: '' })).toBe('');
  });
});

describe('hasJobLocation', () => {
  it('true for coordinates or an address, false when neither', () => {
    expect(hasJobLocation({ latitude: 1, longitude: 2 })).toBe(true);
    expect(hasJobLocation({ address: '5 Oak Rd' })).toBe(true);
    expect(hasJobLocation({})).toBe(false);
    expect(hasJobLocation({ latitude: 1 })).toBe(false); // needs both coords or an address
  });
});

describe('telHref', () => {
  it('builds a tel: link, keeping a leading + and stripping symbols', () => {
    expect(telHref('(512) 555-0134')).toBe('tel:5125550134');
    expect(telHref('+1 512-555-0134')).toBe('tel:+15125550134');
  });
  it('is empty for a number with no digits', () => {
    expect(telHref('')).toBe('');
    expect(telHref(null)).toBe('');
    expect(telHref('n/a')).toBe('');
  });
});
