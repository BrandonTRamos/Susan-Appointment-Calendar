import { describe, expect, it } from 'vitest';
import pack from '../../docs/twilio-registration-pack.md?raw';
import { CONSENT_CONFIRMATION, consentScript } from './consent';

/** The text of each fenced block in the registration pack: what the owner pastes or reads. */
const blocks = [...pack.matchAll(/```text\n([\s\S]*?)\n```/g)].map((match) => match[1]);

describe('the consent script', () => {
  const script = consentScript('[app address]');

  it('is word for word what the registration pack tells the owner to read to Susan', () => {
    expect(blocks).toContain(script.ask.join('\n\n'));
    expect(blocks).toContain(script.afterYes);
  });

  it('covers everything Twilio requires of a verbal consent script', () => {
    const words = script.ask.join(' ');
    expect(words).toMatch(/remind you about your appointments/);
    expect(words).toMatch(/between 2 and 10 a week/);
    expect(words).toMatch(/Message and data rates may apply/);
    expect(words).toMatch(/reply HELP/);
    expect(words).toMatch(/reply STOP/);
    expect(words).toMatch(/\[app address\]\/terms/);
    expect(words).toMatch(/\[app address\]\/privacy/);
    expect(script.ask.at(-1)).toMatch(/Do you agree .* yes or no\.$/);
    expect(script.afterYes).toMatch(/confirm/);
  });

  it("fits the registration form's 1,000 characters at any likely address", () => {
    const longest = consentScript('main.d1234567890abc.amplifyapp.com');
    expect(longest.ask.join('\n\n').length).toBeLessThanOrEqual(1000);
  });
});

describe('the confirmation text', () => {
  it('is the one in the registration pack, as a sample message and as the text to send', () => {
    expect(blocks.filter((block) => block === CONSENT_CONFIRMATION)).toHaveLength(2);
    // It is also quoted inside the description of how consent is given.
    expect(blocks.some((block) => block.includes(`"${CONSENT_CONFIRMATION}"`))).toBe(true);
  });

  it('opens with the name every text opens with, and carries what a first text must', () => {
    expect(CONSENT_CONFIRMATION).toMatch(/^Susan's Calendar: /);
    expect(CONSENT_CONFIRMATION).toMatch(/frequency varies/);
    expect(CONSENT_CONFIRMATION).toMatch(/Msg & data rates may apply/);
    expect(CONSENT_CONFIRMATION).toMatch(/Reply HELP for help/);
    expect(CONSENT_CONFIRMATION).toMatch(/Reply STOP to unsubscribe/);
  });

  it('is plain characters only, and no more than two segments long', () => {
    expect(CONSENT_CONFIRMATION).toMatch(/^[A-Za-z0-9 .,:&']+$/);
    expect(CONSENT_CONFIRMATION.length).toBeLessThanOrEqual(306);
  });
});

describe('the registration pack', () => {
  it('keeps every pasted answer within the length its field allows', () => {
    const description = blocks.find((block) => block.startsWith("Susan's Calendar is a private"))!;
    const consent = blocks.find((block) => block.startsWith('Messages go to one person only'))!;
    const samples = blocks.filter((block) => block.startsWith("Susan's Calendar: "));
    const atAddress = (text: string) =>
      text.replaceAll('[app address]', 'main.d1234567890abc.amplifyapp.com');
    expect(description.length).toBeGreaterThanOrEqual(40);
    expect(description.length).toBeLessThanOrEqual(4096);
    expect(atAddress(consent).length).toBeLessThanOrEqual(1000);
    // Five different samples; the confirmation text appears a second time as the text to send.
    expect(new Set(samples).size).toBe(5);
    for (const sample of samples) {
      expect(sample.length).toBeGreaterThanOrEqual(40);
      expect(sample.length).toBeLessThanOrEqual(1024);
    }
  });

  it('holds no phone number that could be real', () => {
    // Only the invented 555 placeholder may appear. Web addresses hold long article numbers.
    const words = pack.replace(/https?:\/\/\S+/g, '');
    const numbers = words.match(/\+?\d[\d\s().-]{8,}\d/g) ?? [];
    expect(numbers.filter((number) => number !== '555-555-5555')).toEqual([]);
  });
});
