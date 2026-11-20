import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAppAddress, keepSaved, type DeviceRegistry } from './appNotifications';

/**
 * Run once in the app's layout. Opens what a tapped app notification is about, when the service
 * worker (public/app-notifications-sw.js) says one was tapped while the app was open, and saves this
 * device's subscription again each time the app opens.
 */
export function useNotificationTaps(registry: DeviceRegistry | null) {
  const navigate = useNavigate();

  useEffect(() => {
    keepSaved(registry).catch((error: unknown) =>
      console.warn('Could not save this device for notifications again', error),
    );
  }, [registry]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent<{ type?: unknown; url?: unknown } | null>) => {
      if (event.data?.type === 'open' && isAppAddress(event.data.url)) navigate(event.data.url);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
}
