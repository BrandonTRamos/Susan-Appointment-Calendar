import { defineBackend } from '@aws-amplify/backend';
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

// No self sign-up: the owner creates every account in the Cognito console.
cfnUserPool.adminCreateUserConfig = { allowAdminCreateUserOnly: true };
if (isProduction) cfnUserPool.deletionProtection = 'ACTIVE';

// Stay signed in for as long as Cognito allows (ten years), so Susan rarely sees a sign-in screen.
// Signing out, or the owner disabling the account, still ends a session.
cfnUserPoolClient.refreshTokenValidity = 3650;
cfnUserPoolClient.tokenValidityUnits = { refreshToken: 'days' };

// Susan's time zone, for the app (src/config.ts). A value that isn't a time zone fails the deploy.
backend.addOutput({ custom: { timeZone: resolveTimeZone(process.env.SUSAN_TIME_ZONE) } });
