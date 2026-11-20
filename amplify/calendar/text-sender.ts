// Which text sender the backend's functions use: Textbelt once its key is stored as the deployment
// secret TEXTBELT_KEY (README, "Texts to Susan"), and the stand-in, which records each text instead
// of sending it (src/lib/calendar/memory.ts), wherever the key is absent.

import { createStandInSender, type TextSender } from '../../src/lib/calendar';
import { textbeltSender } from './textbelt';

/** The deployment secret that holds the Textbelt key, as functions are given it. */
export const TEXTBELT_KEY = 'TEXTBELT_KEY';

/**
 * What Amplify leaves in a secret's variable when no secret by that name is stored: it fills the
 * variable from the secret when the function starts, and leaves this when there is none.
 */
const UNRESOLVED_SECRET = '<value will be resolved during runtime>';

type Env = Record<string, string | undefined>;

/** The Textbelt key, or null while none is stored. */
function textbeltKey(env: Env): string | null {
  const key = env[TEXTBELT_KEY]?.trim();
  return key && key !== UNRESOLVED_SECRET ? key : null;
}

/** The variable that holds the calendar's reply address, which every text names (amplify/backend.ts). */
export const REPLY_WEBHOOK_URL = 'REPLY_WEBHOOK_URL';

/** The reply address, or null when the function was given none that is a web address. */
export function replyAddress(env: Env = process.env): string | null {
  const address = env[REPLY_WEBHOOK_URL]?.trim();
  return address && /^https:\/\/[^\s]+$/.test(address) ? address : null;
}

/** The Textbelt key for checking that a Reply came from Textbelt, or null while none is stored. */
export function replyKey(env: Env = process.env): string | null {
  return textbeltKey(env);
}

/** Which sender is in use: the app says so while texts are only being recorded. */
export type TextSenderName = 'textbelt' | 'stand-in';

export function textSenderName(env: Env = process.env): TextSenderName {
  return textbeltKey(env) ? 'textbelt' : 'stand-in';
}

/**
 * The sender for a backend function. It looks for the key at each send, since Amplify refreshes a
 * function's secrets while it runs. Every text names the reply address, so Susan's Replies come
 * back to the calendar. Only Textbelt names the texts it takes, so every text there is to ask about
 * is one of Textbelt's, and asking needs no key.
 */
export function textSenderFor(env: Env = process.env): TextSender {
  const standIn = createStandInSender();
  return {
    send(text) {
      const key = textbeltKey(env);
      return key
        ? textbeltSender({ key, replyTo: replyAddress(env) }).send(text)
        : standIn.send(text);
    },
    delivery: (reference) => textbeltSender({ key: '' }).delivery(reference),
  };
}
