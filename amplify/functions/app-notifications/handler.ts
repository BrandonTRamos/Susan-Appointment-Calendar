import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  dataApiDevices,
  tableDeviceReader,
  type DeviceClient,
  type Devices,
} from '../../calendar/app-notification-devices';
import { connectDataApi } from '../../calendar/data-store';
import { appNotificationsHandler } from './requests';

let devices: Promise<Devices> | undefined;

function getDevices() {
  devices ??= connectDataApi()
    .then((client: unknown) => {
      // Why a write about a device was refused is read straight from its table, consistently
      // (amplify/calendar/app-notification-devices.ts).
      const table = process.env.APP_NOTIFICATION_DEVICE_TABLE;
      if (!table) throw new Error('The function has not been told the device table.');
      const reader = tableDeviceReader(DynamoDBDocumentClient.from(new DynamoDBClient({})), table);
      return dataApiDevices(client as DeviceClient, reader);
    })
    .catch((error: unknown) => {
      devices = undefined; // try again on the next request instead of keeping the failure
      throw error;
    });
  return devices;
}

export const handler = appNotificationsHandler({ devices: getDevices });
