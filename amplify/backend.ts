import { defineBackend } from '@aws-amplify/backend';
import { resolveContactEmail, resolveOwnerName } from '../src/lib/publicPage';
import { resolveTimeZone } from '../src/lib/timeZone';
import { auth } from './auth/resource';
import { configureProjectTags } from './cost-tags';

const backend = defineBackend({ auth });

// COST_TAG keeps separate deployments apart in billing; main also tags its own Hosting app.
configureProjectTags(backend.stack, process.env.COST_TAG || 'susans-calendar', {
  appId: process.env.AWS_APP_ID,
  branch: process.env.AWS_BRANCH,
});

// Amplify Hosting sets AWS_BRANCH for branch deploys; it's unset in a personal sandbox.
const isProduction = process.env.AWS_BRANCH === 'main';

const { cfnUserPool, cfnUserPoolClient } = backend.auth.resources.cfnResources;

// No self sign-up: the owner creates every account by hand (README, "Accounts").
cfnUserPool.adminCreateUserConfig = { allowAdminCreateUserOnly: true };
if (isProduction) cfnUserPool.deletionProtection = 'ACTIVE';

// Stay signed in for as long as Cognito allows (ten years), so Susan rarely sees a sign-in screen.
// Signing out, or the owner disabling the account, still ends a session.
cfnUserPoolClient.refreshTokenValidity = 3650;
cfnUserPoolClient.tokenValidityUnits = { refreshToken: 'days' };

// For the app (src/config.ts): Susan's time zone, and the contact address and owner's name shown on
// the public pages. A value that isn't a time zone or an email address fails the deploy. A value
// that isn't set is left out.
backend.addOutput({
  custom: {
    timeZone: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
    contactEmail: resolveContactEmail(process.env.CONTACT_EMAIL) ?? undefined,
    ownerName: resolveOwnerName(process.env.OWNER_NAME) ?? undefined,
  },
});
