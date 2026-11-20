// Where this device is kept for app notifications: the data API's app-notification operations
// (amplify/data/resource.ts), carried out as the signed-in person.

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { DEVICE_REMOVALS, type DeviceRegistry, type DeviceRemoval } from '../lib/appNotifications';

function answered<T>(answer: { data?: T | null; errors?: readonly { message: string }[] }): T {
  if (answer.errors?.length || answer.data == null)
    throw new Error(answer.errors?.map((e) => e.message).join('; ') || 'No answer');
  return answer.data;
}

export function createAppNotificationDevices(): DeviceRegistry {
  const client = generateClient<Schema>();
  return {
    publicKey: async () => answered(await client.queries.appNotificationKey()),
    async turnOn(subscription) {
      answered(await client.mutations.turnOnAppNotifications(subscription));
    },
    async turnOff(endpoint) {
      const removal = answered(await client.mutations.turnOffAppNotifications({ endpoint }));
      if (!DEVICE_REMOVALS.includes(removal as DeviceRemoval))
        throw new Error('The answer could not be read.');
      return removal as DeviceRemoval;
    },
  };
}
