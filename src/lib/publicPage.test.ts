import { describe, expect, it } from 'vitest';
import { publicPageAt, resolveContactEmail, resolveOwnerName } from './publicPage';

describe('the public pages and their addresses', () => {
  it('are /about, /privacy and /terms', () => {
    expect(publicPageAt('/about')).toBe('about');
    expect(publicPageAt('/privacy')).toBe('privacy');
    expect(publicPageAt('/terms')).toBe('terms');
  });

  it('open with or without a closing slash', () => {
    expect(publicPageAt('/about/')).toBe('about');
    expect(publicPageAt('/terms/')).toBe('terms');
  });

  it('are nothing else: every other address needs a sign-in', () => {
    for (const path of ['/', '/month', '/settings', '/about/more', '/aboutus', '/privacy.html'])
      expect(publicPageAt(path)).toBeNull();
  });
});

describe('the contact email address', () => {
  it('is the one set in CONTACT_EMAIL', () => {
    expect(resolveContactEmail('owner@example.com')).toBe('owner@example.com');
    expect(resolveContactEmail('  owner@example.com ')).toBe('owner@example.com');
  });

  it('is missing when nothing is set', () => {
    expect(resolveContactEmail(undefined)).toBeNull();
    expect(resolveContactEmail(null)).toBeNull();
    expect(resolveContactEmail('   ')).toBeNull();
  });

  it('refuses a value that is not an email address, so a typo cannot reach the public page', () => {
    expect(() => resolveContactEmail('owner')).toThrow(/CONTACT_EMAIL/);
    expect(() => resolveContactEmail('owner@example')).toThrow(/CONTACT_EMAIL/);
    expect(() => resolveContactEmail('owner @example.com')).toThrow(/CONTACT_EMAIL/);
  });
});

describe("the owner's name", () => {
  it('is the one set in OWNER_NAME, or missing', () => {
    expect(resolveOwnerName(' Linda Example ')).toBe('Linda Example');
    expect(resolveOwnerName(undefined)).toBeNull();
    expect(resolveOwnerName('  ')).toBeNull();
  });
});
