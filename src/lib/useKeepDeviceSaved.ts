import { useEffect } from 'react';
import { keepSaved, type DeviceRegistry } from './appNotifications';

/**
 * Run once in the app's layout: saves this device's subscription for app notifications again each
 * time the app opens. Opening what a tapped notification is about needs nothing here: the service
 * worker loads its address (public/app-notifications-sw.js).
 */
export function useKeepDeviceSaved(registry: DeviceRegistry | null) {
  useEffect(() => {
    keepSaved(registry).catch((error: unknown) =>
      console.warn('Could not save this device for notifications again', error),
    );
  }, [registry]);
}
