// Which text sender the backend's functions use. The stand-in records each text instead of sending
// it (src/lib/calendar/memory.ts); it is used wherever Textbelt's key is absent. Ticket 13 adds the
// Textbelt sender here, used once the key is stored as a deployment secret.

import { createStandInSender, type TextSender } from '../../src/lib/calendar';

/** Which sender is in use: the app says so when texts are only being recorded. */
export type TextSenderName = 'stand-in';

export function textSenderName(): TextSenderName {
  return 'stand-in';
}

export function textSenderFor(): TextSender {
  return createStandInSender();
}
