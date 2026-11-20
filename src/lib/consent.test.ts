import { describe, expect, it } from 'vitest';
import setup from '../../docs/text-message-setup.md?raw';
import { CONSENT_CONFIRMATION } from './consent';

/** The text of each fenced block in the setup document: what the owner sends or runs. */
const blocks = (language: string) =>
  [...setup.matchAll(new RegExp('```' + language + '\\n([\\s\\S]*?)\\n```', 'g'))].map(
    (match) => match[1],
  );
const words = blocks('text');
const commands = blocks('bash');

describe('the Confirmation text', () => {
  it('is the one in the setup document, shown once and sent by the command beneath it', () => {
    expect(words.filter((block) => block === CONSENT_CONFIRMATION)).toHaveLength(1);
    expect(
      commands.filter((command) => command.includes(`message="${CONSENT_CONFIRMATION}"`)),
    ).toHaveLength(1);
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

  it('holds no web address, which Textbelt does not send without permission', () => {
    expect(CONSENT_CONFIRMATION).not.toMatch(/https?:|www\.|\.com/);
  });
});

describe('the setup document', () => {
  it('holds no phone number that could be real, and no key', () => {
    // Web addresses hold long numbers of their own; the commands use named placeholders.
    const prose = setup.replace(/https?:\/\/\S+/g, '');
    expect(prose.match(/\+?\d[\d\s().-]{8,}\d/g) ?? []).toEqual([]);
    for (const command of commands) expect(command).toMatch(/SUSANS_NUMBER|TEXT_ID/);
    expect(setup).not.toMatch(/key=(?!YOUR_KEY\b)\w/);
  });
});
