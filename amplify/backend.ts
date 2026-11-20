import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { resolveContactEmail, resolveOwnerName } from '../src/lib/publicPage';
import { resolveTimeZone } from '../src/lib/timeZone';
import { auth } from './auth/resource';
import { configureProjectTags } from './cost-tags';
import { data } from './data/resource';
import { calendarCommands } from './functions/calendar-commands/resource';
import { seriesTopUp } from './functions/series-top-up/resource';
import { subscriptionFeed } from './functions/subscription-feed/resource';

const backend = defineBackend({ auth, data, calendarCommands, seriesTopUp, subscriptionFeed });

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

// The daily Series top-up runs one at a time, so that two runs never try to make the same
// Appointments at once.
backend.seriesTopUp.resources.cfnResources.cfnFunction.reservedConcurrentExecutions = 1;

// The calendar subscription's feed, at a public address. Each person's secret link is checked in
// the function (amplify/functions/subscription-feed/feed.ts). The address is public, so concurrent
// requests are capped: plenty for a handful of calendar apps refreshing, and a ceiling on cost if
// something floods it. Requests over the cap get 429 Too Many Requests.
const feedUrl = backend.subscriptionFeed.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
backend.subscriptionFeed.resources.cfnResources.cfnFunction.reservedConcurrentExecutions = 3;

// The feed reads the Appointment and SubscriptionLink tables itself, with strongly consistent reads,
// which the data API's reads are not (amplify/calendar/feed-store.ts). It may read them and nothing
// more. Writing still goes only through the calendar core and the data API.
const feedTables = {
  APPOINTMENT_TABLE: backend.data.resources.tables['Appointment'],
  SUBSCRIPTION_LINK_TABLE: backend.data.resources.tables['SubscriptionLink'],
};
for (const [variable, table] of Object.entries(feedTables)) {
  backend.subscriptionFeed.addEnvironment(variable, table.tableName);
  backend.subscriptionFeed.resources.lambda.addToRolePolicy(
    new PolicyStatement({
      actions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:Scan'],
      resources: [table.tableArn, `${table.tableArn}/index/*`],
    }),
  );
}

// For the app (src/config.ts): Susan's time zone; the contact address and owner's name shown on the
// public pages; and the feed's address, which each person's link is made from. A value that isn't a
// time zone or an email address fails the deploy. A value that isn't set is left out.
backend.addOutput({
  custom: {
    timeZone: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
    contactEmail: resolveContactEmail(process.env.CONTACT_EMAIL) ?? undefined,
    ownerName: resolveOwnerName(process.env.OWNER_NAME) ?? undefined,
    subscriptionFeedUrl: feedUrl.url,
  },
});
