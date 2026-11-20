import { defineBackend } from '@aws-amplify/backend';
import { resolveContactEmail, resolveOwnerName } from '../src/lib/publicPage';
import { resolveTimeZone } from '../src/lib/timeZone';
import { auth } from './auth/resource';
import { configureProjectTags } from './cost-tags';
import { data } from './data/resource';
import { calendarCommands } from './functions/calendar-commands/resource';

const backend = defineBackend({ auth, data, calendarCommands });

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

// Point-in-time recovery for every table, and deletion protection in production.
for (const table of Object.values(backend.data.resources.cfnResources.amplifyDynamoDbTables)) {
  table.pointInTimeRecoveryEnabled = true;
  if (isProduction) table.deletionProtectionEnabled = true;
}

// The data API tells the commands function who is calling but not their name, so it looks the
// name up in the user pool (amplify/calendar/people.ts). It may read accounts and nothing more.
const { userPool } = backend.auth.resources;
userPool.grant(backend.calendarCommands.resources.lambda, 'cognito-idp:AdminGetUser');
backend.calendarCommands.addEnvironment('USER_POOL_ID', userPool.userPoolId);

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
