import webpush from 'web-push';
import { describe, expect, it } from 'vitest';
import { fromBase64Url, generateVapidKeys, sameKey } from './vapid';

describe('VAPID keys', () => {
  it('makes a key pair web-push can sign with', async () => {
    const keys = await generateVapidKeys();
    expect(fromBase64Url(keys.publicKey)).toHaveLength(65);
    expect(fromBase64Url(keys.privateKey)).toHaveLength(32);
    const headers = webpush.getVapidHeaders(
      'https://web.push.apple.com',
      'https://main.example.amplifyapp.com',
      keys.publicKey,
      keys.privateKey,
      'aes128gcm',
    );
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=/);
  });

  it('recognises a subscription made with the same key', async () => {
    const { publicKey } = await generateVapidKeys();
    expect(sameKey(fromBase64Url(publicKey).buffer, publicKey)).toBe(true);
    expect(sameKey(new ArrayBuffer(65), publicKey)).toBe(false);
    expect(sameKey(null, publicKey)).toBe(false);
  });
});
