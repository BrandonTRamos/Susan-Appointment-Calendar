import { describe, expect, it } from 'vitest';
import { appUrl } from './app-url';

describe('the address app notifications give as their contact', () => {
  it("is the Amplify app's own address when Amplify Hosting builds it", () => {
    expect(appUrl({ AWS_APP_ID: 'dabc123', AWS_BRANCH: 'main' })).toBe(
      'https://main.dabc123.amplifyapp.com',
    );
  });

  it('turns a branch name into a host name the way Amplify does', () => {
    expect(appUrl({ AWS_APP_ID: 'dabc123', AWS_BRANCH: 'ticket/08-x' })).toBe(
      'https://ticket-08-x.dabc123.amplifyapp.com',
    );
  });

  it('is APP_URL when that is set', () => {
    expect(
      appUrl({
        APP_URL: 'https://calendar.example.com',
        AWS_APP_ID: 'dabc123',
        AWS_BRANCH: 'main',
      }),
    ).toBe('https://calendar.example.com');
  });

  it('is a placeholder in a sandbox', () => {
    expect(appUrl({})).toBe('mailto:noreply@example.com');
  });
});
