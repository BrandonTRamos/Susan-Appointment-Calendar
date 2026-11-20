import { defineFunction } from '@aws-amplify/backend';

/**
 * Turns app notifications on and off for a device, and hands out the public key a device
 * subscribes with (amplify/data/resource.ts). It writes no calendar data.
 */
export const appNotifications = defineFunction({
  name: 'app-notifications',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 15,
  memoryMB: 256,
  // Deployed alongside the data stack, which avoids a circular stack dependency.
  resourceGroupName: 'data',
});
