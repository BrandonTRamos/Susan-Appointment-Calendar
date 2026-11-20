import { defineBackend } from '@aws-amplify/backend';
import { Duration, Stack } from 'aws-cdk-lib';
import { CfnPolicy, CfnRole, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { CfnSchedule } from 'aws-cdk-lib/aws-scheduler';
import { resolveContactEmail, resolveOwnerName } from '../src/lib/publicPage';
import { resolveTimeZone } from '../src/lib/timeZone';
import { auth } from './auth/resource';
import { resolveAlertSender } from './calendar/alert-email';
import { configureProjectTags } from './cost-tags';
import { data } from './data/resource';
import { appNotifications } from './functions/app-notifications/resource';
import { calendarCommands } from './functions/calendar-commands/resource';
import { MCP_SERVER_FIELDS } from './functions/mcp-server/access';
import { mcpServer } from './functions/mcp-server/resource';
import { sendTexts } from './functions/send-texts/resource';
import { SERIES_TOP_UP_FIELDS } from './functions/series-top-up/access';
import { seriesTopUp } from './functions/series-top-up/resource';
import { subscriptionFeed } from './functions/subscription-feed/resource';

const backend = defineBackend({
  auth,
  data,
  calendarCommands,
  seriesTopUp,
  subscriptionFeed,
  appNotifications,
  sendTexts,
  mcpServer,
});

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
// name up in the user pool (amplify/calendar/people.ts). To send Activity updates it lists the
// Admins group (amplify/calendar/admin-messenger.ts). It may read accounts and nothing more.
const { userPool } = backend.auth.resources;
userPool.grant(
  backend.calendarCommands.resources.lambda,
  'cognito-idp:AdminGetUser',
  'cognito-idp:ListUsersInGroup',
);
backend.calendarCommands.addEnvironment('USER_POOL_ID', userPool.userPoolId);

// The scheduled run raises Alerts: it lists the Admins group to find every Admin and the address
// each signs in with, and nothing more of the user pool. `npm run synth` checks it.
userPool.grant(backend.sendTexts.resources.lambda, 'cognito-idp:ListUsersInGroup');
backend.sendTexts.addEnvironment('USER_POOL_ID', userPool.userPoolId);

// It emails them through AWS's email service (amplify/calendar/alert-email.ts). Per the SES v2
// Service Authorization Reference (list_sesv2.html, read 20 November 2026), ses:SendEmail is
// authorized on an `identity` resource, `arn:${Partition}:ses:${Region}:${Account}:identity/
// ${IdentityName}`, and supports the condition key ses:FromAddress. So it may send only from the
// one configured address, through identities in this account and region. The resource is every
// identity there rather than one, because the sender may be verified as an address or as its
// domain, and in the SES sandbox the recipients are verified identities too. Without
// ALERT_EMAIL_FROM it may not send email at all. `npm run synth` checks it.
const alertsFrom = resolveAlertSender(process.env.ALERT_EMAIL_FROM);
if (alertsFrom) {
  const stack = Stack.of(backend.sendTexts.resources.lambda);
  backend.sendTexts.resources.lambda.addToRolePolicy(
    new PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: [`arn:${stack.partition}:ses:${stack.region}:${stack.account}:identity/*`],
      conditions: { StringEquals: { 'ses:FromAddress': alertsFrom } },
    }),
  );
}

// The daily Series top-up runs one at a time, so that two runs never try to make the same
// Appointments at once. A run that fails is not tried again by Lambda, and the schedule tries to
// start one for at most an hour: the horizon is months ahead, so the next day's run catches up.
// `npm run synth` checks all of this.
const seriesTopUpLambda = backend.seriesTopUp.resources.lambda;
backend.seriesTopUp.resources.cfnResources.cfnFunction.reservedConcurrentExecutions = 1;
seriesTopUpLambda.configureAsyncInvoke({ maxEventAge: Duration.hours(1), retryAttempts: 0 });
for (const schedule of seriesTopUpLambda.node.findAll())
  if (schedule instanceof CfnSchedule)
    schedule.addPropertyOverride('Target.RetryPolicy', {
      MaximumEventAgeInSeconds: 3600,
      MaximumRetryAttempts: 2,
    });

/** Fields of the data API, by type: 'Query' or 'Mutation'. */
type Fields = Record<'Query' | 'Mutation', string[]>;

/**
 * Lets a function call these fields of the data API and no others. Amplify would let a function the
 * data schema names call every query and mutation; this narrows its one policy that does.
 */
function onlyDataApiFields(
  lambda: { role?: { node: { defaultChild?: unknown } } },
  name: string,
  allowed: Fields,
) {
  const api = backend.data.resources.graphqlApi;
  const dataStack = Stack.of(api);
  const role = lambda.role?.node.defaultChild as CfnRole;
  const roleRef = JSON.stringify(dataStack.resolve(role.ref));
  const fields = Object.entries(allowed).flatMap(([type, names]) =>
    names.map((field) => dataStack.resolve(`${api.arn}/types/${type}/fields/${field}`)),
  );
  const access = dataStack.node
    .findAll()
    .filter((child): child is CfnPolicy => child instanceof CfnPolicy)
    .filter((policy) => JSON.stringify(dataStack.resolve(policy.roles)).includes(roleRef))
    .filter((policy) =>
      JSON.stringify(dataStack.resolve(policy.policyDocument)).includes('appsync:GraphQL'),
    );
  if (access.length !== 1) throw new Error(`Could not find the ${name} data API access.`);
  const document = dataStack.resolve(access[0].policyDocument) as {
    Statement: { Action: unknown; Resource: unknown }[];
  };
  for (const statement of document.Statement)
    if (statement.Action === 'appsync:GraphQL') statement.Resource = fields;
  access[0].addPropertyOverride('PolicyDocument', document);
}

// The app-notifications function may reach the devices app notifications go to and the key that
// signs them, and nothing else in the data API: Amplify would let it call every query and mutation,
// the calendar's included. `npm run synth` checks it.
onlyDataApiFields(backend.appNotifications.resources.lambda, 'app-notifications', {
  Query: ['getAppNotificationKey'],
  Mutation: [
    'createAppNotificationDevice',
    'updateAppNotificationDevice',
    'deleteAppNotificationDevice',
    'createAppNotificationKey',
  ],
});

// The Series top-up may call only the data API fields its code needs (SERIES_TOP_UP_FIELDS in
// amplify/functions/series-top-up/access.ts). `npm run synth` checks it.
onlyDataApiFields(backend.seriesTopUp.resources.lambda, 'Series top-up', SERIES_TOP_UP_FIELDS);

// When a write about a device is refused, the function reads whose the device is now straight from
// its table, with a strongly consistent read, which the data API's reads are not
// (amplify/calendar/app-notification-devices.ts). It may get one item from that table and nothing
// more; every write still goes through the data API.
const deviceTable = backend.data.resources.tables['AppNotificationDevice'];
backend.appNotifications.addEnvironment('APP_NOTIFICATION_DEVICE_TABLE', deviceTable.tableName);
backend.appNotifications.resources.lambda.addToRolePolicy(
  new PolicyStatement({ actions: ['dynamodb:GetItem'], resources: [deviceTable.tableArn] }),
);

// The MCP server, at a public address, for a person's AI agent (amplify/functions/mcp-server). Its
// agent key is checked in the function. The address is public, so concurrent requests are capped:
// plenty for a few agents, and a ceiling on cost if something floods it, as in the sibling apps.
// Requests over the cap get 429 Too Many Requests. `npm run synth` checks all of this.
const mcpLambda = backend.mcpServer.resources.lambda;
const mcpUrl = mcpLambda.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });
backend.mcpServer.resources.cfnResources.cfnFunction.reservedConcurrentExecutions = 3;

// It changes the calendar through the core, which writes through the data API like the commands
// function, and may call only the fields its code needs (MCP_SERVER_FIELDS in
// amplify/functions/mcp-server/access.ts): no settings, subscription links, agent keys or texts.
onlyDataApiFields(mcpLambda, 'MCP server', MCP_SERVER_FIELDS);

// It finds an agent key by its hash straight from the AgentKey table, with a strongly consistent
// read, so that a revoked key stops at once (amplify/calendar/agent-key-table.ts). It may get one
// item from that table and nothing more.
const agentKeyTable = backend.data.resources.tables['AgentKey'];
backend.mcpServer.addEnvironment('AGENT_KEY_TABLE', agentKeyTable.tableName);
mcpLambda.addToRolePolicy(
  new PolicyStatement({ actions: ['dynamodb:GetItem'], resources: [agentKeyTable.tableArn] }),
);

// It acts as the key's person: it looks their account up by its ID for their name, and to refuse a
// key whose account is disabled or gone, and lists the Admins group for the Activity updates.
userPool.grant(mcpLambda, 'cognito-idp:AdminGetUser', 'cognito-idp:ListUsersInGroup');
backend.mcpServer.addEnvironment('USER_POOL_ID', userPool.userPoolId);

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

// The scheduled run never overlaps itself: only one may run at a time, and a run that cannot start
// because the last is still going is dropped rather than queued or retried, since the next one is a
// minute away. Each text is also claimed before it is sent (src/lib/calendar/core.ts), so that even
// two runs at once could not send it twice. `npm run synth` checks all of this.
const sendTextsLambda = backend.sendTexts.resources.lambda;
backend.sendTexts.resources.cfnResources.cfnFunction.reservedConcurrentExecutions = 1;
sendTextsLambda.configureAsyncInvoke({ maxEventAge: Duration.minutes(1), retryAttempts: 0 });
for (const schedule of sendTextsLambda.node.findAll())
  if (schedule instanceof CfnSchedule)
    schedule.addPropertyOverride('Target.RetryPolicy', {
      MaximumEventAgeInSeconds: 60,
      MaximumRetryAttempts: 0,
    });

// For the app (src/config.ts): Susan's time zone; the contact address and owner's name shown on the
// public pages; the feed's address, which each person's link is made from; and the MCP server's
// address, which Settings shows beside a new agent key. A value that isn't a
// time zone or an email address fails the deploy. A value that isn't set is left out. Which text
// sender is in use is not here: the Textbelt key is a secret that can be stored after a deploy, so
// the app asks (the textSender query in amplify/data/resource.ts).
backend.addOutput({
  custom: {
    timeZone: resolveTimeZone(process.env.SUSAN_TIME_ZONE),
    contactEmail: resolveContactEmail(process.env.CONTACT_EMAIL) ?? undefined,
    ownerName: resolveOwnerName(process.env.OWNER_NAME) ?? undefined,
    subscriptionFeedUrl: feedUrl.url,
    mcpEndpoint: `${mcpUrl.url}mcp`,
  },
});
