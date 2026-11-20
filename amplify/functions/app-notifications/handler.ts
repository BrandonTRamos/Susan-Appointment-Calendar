import {
  dataApiDevices,
  type DeviceClient,
  type Devices,
} from '../../calendar/app-notification-devices';
import { connectDataApi } from '../../calendar/data-store';
import { appNotificationsHandler } from './requests';

let devices: Promise<Devices> | undefined;

function getDevices() {
  devices ??= connectDataApi()
    .then((client: unknown) => dataApiDevices(client as DeviceClient))
    .catch((error: unknown) => {
      devices = undefined; // try again on the next request instead of keeping the failure
      throw error;
    });
  return devices;
}

export const handler = appNotificationsHandler({ devices: getDevices });
