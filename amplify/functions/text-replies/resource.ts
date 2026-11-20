import { defineFunction, secret } from '@aws-amplify/backend';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { TEXTBELT_KEY } from '../../calendar/text-sender';

/**
 * The calendar's reply address: a public address (amplify/backend.ts) where Textbelt sends each
 * text Susan sends back. It takes only a request Textbelt signed with the key, within 15 minutes,
 * and hands the Reply to the calendar core, which keeps it; the scheduled run passes it on and
 * answers her (amplify/functions/text-replies/replies.ts).
 */
export const textReplies = defineFunction({
  name: 'text-replies',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 15,
  memoryMB: 512,
  // It writes through the data API, so it is deployed alongside the data stack.
  resourceGroupName: 'data',
  environment: {
    // Susan's time zone. A value that isn't a time zone fails the deploy (src/lib/timeZone.ts).
    SUSAN_TIME_ZONE: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
    // The Textbelt key, from the deployment secret, which Textbelt signs each Reply with. While
    // none is stored, every request is refused: nothing could prove it came from Textbelt.
    [TEXTBELT_KEY]: secret(TEXTBELT_KEY),
  },
});
