// The VAPID key pair that signs app notifications (web push), made with Web Crypto, which browsers
// and Node 22 both have. As in Wellbeing, the pair is made on first use and kept in the data API,
// so no secret has to be set up. Here the backend makes it (amplify/functions/app-notifications),
// so the private half never leaves the backend. Both halves are base64url: the public key as the
// 65-byte uncompressed P-256 point browsers take as `applicationServerKey`, the private key as the
// 32-byte scalar web-push signs with.

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

const toBase64Url = (bytes: Uint8Array) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  if (!jwk.d) throw new Error('Could not export the private key.');
  return { publicKey: toBase64Url(raw), privateKey: jwk.d };
}

/** Whether a subscription's key (from `PushSubscription.options`) is this public key. */
export function sameKey(current: ArrayBuffer | null | undefined, publicKey: string): boolean {
  if (!current) return false;
  return toBase64Url(new Uint8Array(current)) === publicKey;
}
