import { defineFunction } from '@aws-amplify/backend';
import { resolveTimeZone } from '../../../src/lib/timeZone';
import { appUrl } from '../../app-url';

/**
 * Serves the Model Context Protocol at a public address (amplify/backend.ts), for a person's AI agent
 * holding one of their agent keys. Its tools change the calendar only through the calendar core,
 * which writes through the data API like the commands function. It sends no text and no email.
 */
export const mcpServer = defineFunction({
  name: 'mcp-server',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 30,
  memoryMB: 512,
  // Deployed alongside the data stack, which avoids a circular stack dependency.
  resourceGroupName: 'data',
  environment: {
    // Susan's time zone. A value that isn't a time zone fails the deploy (src/lib/timeZone.ts).
    SUSAN_TIME_ZONE: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
    // Names the sender of the Activity updates' app notifications to the push services.
    APP_URL: appUrl(),
  },
});
