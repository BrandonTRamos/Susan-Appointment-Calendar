/**
 * The deployed app's address, which app notifications send as their contact (the VAPID subject),
 * as Wellbeing does. Amplify Hosting sets AWS_APP_ID and AWS_BRANCH while it builds, so each Amplify
 * app gets its own address with nothing written in the repository. APP_URL overrides it (for a
 * custom domain); a sandbox has neither, so it gets a placeholder.
 */
export function appUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.APP_URL) return env.APP_URL;
  if (env.AWS_APP_ID && env.AWS_BRANCH) {
    // Amplify turns characters a host name can't have (such as "/") into hyphens.
    const branch = env.AWS_BRANCH.replace(/[^A-Za-z0-9-]/g, '-');
    return `https://${branch}.${env.AWS_APP_ID}.amplifyapp.com`;
  }
  return 'mailto:noreply@example.com';
}
