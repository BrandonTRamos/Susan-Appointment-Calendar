import { afterEach, describe, expect, it, vi } from 'vitest';
import { textSenderFor, textSenderName } from './text-sender';

/** What Amplify leaves in a secret's variable until the secret is stored. */
const UNSET = '<value will be resolved during runtime>';

afterEach(() => vi.unstubAllGlobals());

describe('the text sender the backend uses', () => {
  it('is the stand-in, which records texts and sends none, while no Textbelt key is stored', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    for (const env of [{}, { TEXTBELT_KEY: '' }, { TEXTBELT_KEY: UNSET }, { TEXTBELT_KEY: '  ' }]) {
      expect(textSenderName(env)).toBe('stand-in');
      expect(await textSenderFor(env).send({ to: '+15555550123', words: 'Hello' })).toEqual({
        sent: true,
        reference: null,
        creditLeft: null,
      });
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('is Textbelt once the key is stored as the deployment secret', async () => {
    const request = vi.fn(async () =>
      Response.json({ success: true, quotaRemaining: 40, textId: 12345 }),
    );
    vi.stubGlobal('fetch', request);
    const env = { TEXTBELT_KEY: 'invented-key-0000' };
    expect(textSenderName(env)).toBe('textbelt');
    expect(await textSenderFor(env).send({ to: '+15555550123', words: 'Hello' })).toEqual({
      sent: true,
      reference: '12345',
      creditLeft: 40,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it('looks for the key at each send, so a key stored later is used without a restart', async () => {
    const request = vi.fn(async () => Response.json({ success: true, textId: 7 }));
    vi.stubGlobal('fetch', request);
    const env: Record<string, string | undefined> = { TEXTBELT_KEY: UNSET };
    const sender = textSenderFor(env);
    await sender.send({ to: '+15555550123', words: 'Hello' });
    expect(request).not.toHaveBeenCalled();
    env.TEXTBELT_KEY = 'invented-key-0000';
    await sender.send({ to: '+15555550123', words: 'Hello' });
    expect(request).toHaveBeenCalledOnce();
  });

  it('asks Textbelt what became of a text it named', async () => {
    const request = vi.fn(async () => Response.json({ status: 'DELIVERED' }));
    vi.stubGlobal('fetch', request);
    expect(await textSenderFor({ TEXTBELT_KEY: 'invented-key-0000' }).delivery('12345')).toBe(
      'delivered',
    );
  });
});
