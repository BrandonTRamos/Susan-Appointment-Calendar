// Synthesizes the Amplify backend with CDK locally, without AWS credentials. It catches CDK and
// bundling errors before a deploy, then checks the sign-in rules, the rules about who may read and
// write calendar data and subscription links, the feed's public address, the scheduled run that
// sends texts and raises Alerts, and the cost tags in what was synthesized. Usage: npm run synth
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = mkdtempSync(join(tmpdir(), 'susans-calendar-synth-'));
const result = spawnSync('npx', ['tsx', 'amplify/backend.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CDK_OUTDIR: out,
    CDK_DEFAULT_REGION: 'us-east-1',
    CDK_DEFAULT_ACCOUNT: '123456789012',
    CDK_CONTEXT_JSON: JSON.stringify({
      'amplify-backend-namespace': 'susanscalendar',
      'amplify-backend-name': 'synth',
      'amplify-backend-type': 'sandbox',
    }),
  },
});

/** The resources of the root stack and of each nested stack, one object per stack. */
function stacks() {
  return readdirSync(out)
    .filter((file) => file.endsWith('.template.json'))
    .map((file) => JSON.parse(readFileSync(join(out, file), 'utf8')).Resources);
}

/** Every resource of a type, across the root stack and its nested stacks. */
function resources(type) {
  return stacks()
    .flatMap((stack) => Object.values(stack))
    .filter((resource) => resource.Type === type)
    .map((resource) => resource.Properties ?? {});
}

/** The words of one step of a data API operation, kept in the stack or in a file beside it. */
function stepWords(step, which) {
  const inline = step[`${which}MappingTemplate`];
  if (typeof inline === 'string') return inline;
  const kept = JSON.stringify(step[`${which}MappingTemplateS3Location`] ?? '');
  const file = /[0-9a-f]{64}\.vtl/.exec(kept)?.[0];
  return file ? readFileSync(join(out, `asset.${file}`), 'utf8') : '';
}

// Amplify writes each operation's rule for a signed-in person between these two lines. Nothing
// between them means a signed-in person may not call it.
const SIGNED_IN = '#if( $util.authType() == "User Pool Authorization" )';
const AFTER_SIGNED_IN = '#if( !$isAuthorized';
const DYNAMIC_FILTERS = '## Apply dynamic roles auth';
const NO_FILTERS =
  /#set\( \$(hasValidOwnerArgument = false|authRuntimeFilter = \[\]|authOwnerRuntimeFilter = \[\]|authGroupRuntimeFilter = \[\]) \)/g;

/** Each data API operation of one kind, by name, with the words of the steps that hold its rules. */
function ruleSteps(kind) {
  const found = new Map();
  for (const stack of stacks()) {
    for (const { Type, Properties } of Object.values(stack)) {
      if (Type !== 'AWS::AppSync::Resolver' || Properties.TypeName !== kind) continue;
      const rules = (Properties.PipelineConfig?.Functions ?? [])
        .map((step) => stack[step['Fn::GetAtt']?.[0]]?.Properties ?? {})
        .flatMap((step) => [stepWords(step, 'Request'), stepWords(step, 'Response')])
        .filter((words) => words.includes(SIGNED_IN));
      found.set(Properties.FieldName, rules);
    }
  }
  return found;
}

/**
 * The data API's operations of one kind ('Query', 'Mutation' or 'Subscription'), by name, each
 * with whether a signed-in person may call it. An operation with no rule at all counts as open, so
 * that it is noticed.
 */
function openToSignedIn(kind) {
  const allows = (words) =>
    words
      .split(SIGNED_IN)[1]
      .split(AFTER_SIGNED_IN)[0]
      // A subscription's rule always ends by applying the owner and group filters set above it,
      // and always starts with no filters. Neither lets anyone in by itself.
      .split(DYNAMIC_FILTERS)[0]
      .replace(NO_FILTERS, '')
      .replace('#end', '')
      .trim() !== '';
  return new Map(
    [...ruleSteps(kind)].map(([name, rules]) => [name, rules.length === 0 || rules.some(allows)]),
  );
}

/**
 * Whether a signed-in person may call an operation only on rows whose `personId` is the `sub` they
 * signed in with: Amplify's rule for a model owned by the person named in `personId`, and no rule
 * that lets in everyone signed in.
 */
function onlyOwn(rules) {
  const everyone = /User Pool Authorization" \)\s*#set\( \$isAuthorized = true \)/;
  return (
    rules.length > 0 &&
    rules.every((words) => !everyone.test(words)) &&
    rules.some((words) => /claims\.get\("sub"\)/.test(words) && /"?personId"?/.test(words))
  );
}

/** The query that lists a model's rows, as Amplify names it: a plural, not doubled. */
const listOf = (model) => `list${model}${model.endsWith('s') ? '' : 's'}`;

/** The calendar core's commands (amplify/data/resource.ts): the only way to change the calendar. */
const COMMANDS = [
  'addAppointment',
  'cancelAppointment',
  'changeAppointment',
  'changeSettings',
  'makeSubscriptionLink',
  'removeAppointment',
  'sendTestText',
  'switchOffSubscriptionLink',
];
/**
 * The calendar, the record of texts, and the settings (amplify/data/resource.ts). Only the commands
 * function and the scheduled run write these directly.
 */
const MODELS = ['Appointment', 'ActivityRecord', 'Text', 'CalendarSettings'];
/** Kept per person, and read only by that person. Only the commands function writes these. */
const OWN_MODELS = ['SubscriptionLink'];
/**
 * Turning app notifications on and off for a device, and keeping it up to date: the only other
 * mutations anyone may call.
 */
const DEVICE_MUTATIONS = [
  'renewAppNotifications',
  'turnOffAppNotifications',
  'turnOnAppNotifications',
];
/** Kept for app notifications, and closed to everyone signed in: only the backend reaches them. */
const CLOSED_MODELS = ['AppNotificationDevice', 'AppNotificationKey'];
/** All the app-notifications function may call in the data API (amplify/backend.ts). */
const APP_NOTIFICATION_FIELDS = [
  'Mutation/createAppNotificationDevice',
  'Mutation/createAppNotificationKey',
  'Mutation/deleteAppNotificationDevice',
  'Mutation/updateAppNotificationDevice',
  'Query/getAppNotificationKey',
];

/**
 * What the app-notifications function's role may call in the data API, as 'Type/field', or
 * 'Type/*' for a whole type. Its role is the one its own policies name.
 */
function appNotificationsAccess() {
  return stacks()
    .flatMap((stack) => Object.values(stack))
    .filter(
      (resource) =>
        resource.Type === 'AWS::IAM::Policy' &&
        resource.Properties.Roles?.some((each) =>
          /^appnotificationslambdaServiceRole/.test(each.Ref ?? ''),
        ),
    )
    .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
    .filter((statement) => [statement.Action].flat().includes('appsync:GraphQL'))
    .flatMap((statement) => [statement.Resource].flat())
    .map((resource) => {
      const tail = resource?.['Fn::Join']?.[1]?.at(-1) ?? String(resource);
      return /\/types\/(\w+)\/(?:fields\/)?([\w*]+)$/.exec(tail)?.slice(1).join('/') ?? tail;
    })
    .sort();
}

/**
 * The words of the step that writes a device in DynamoDB for one data API mutation ('Delete' or
 * 'Update'). A device is forgotten, or kept up to date, only by a write that carries a condition
 * (amplify/calendar/app-notification-devices.ts), so this step must put the caller's condition into
 * the one conditional write.
 */
function deviceWriteWords(verb) {
  return stacks()
    .flatMap((stack) => Object.entries(stack))
    .filter(
      ([id, resource]) =>
        resource.Type === 'AWS::AppSync::FunctionConfiguration' &&
        id.startsWith(`Mutation${verb}AppNotificationDeviceDataResolverFn`),
    )
    .map(([, resource]) => stepWords(resource.Properties, 'Request'))
    .join('\n');
}

/**
 * The app-notifications function: its properties, what its role may do outside the data API, and
 * the code it runs as bundled for the deploy.
 */
function appNotificationsFunction() {
  const all = stacks();
  const lambda = all
    .flatMap((stack) => Object.entries(stack))
    .find(
      ([id, resource]) =>
        resource.Type === 'AWS::Lambda::Function' && /^appnotificationslambda[0-9A-F]+$/.test(id),
    )?.[1];
  if (!lambda) return { properties: {}, statements: [], code: '' };
  const role = lambda.Properties.Role?.['Fn::GetAtt']?.[0];
  const statements = all
    .flatMap((stack) => Object.values(stack))
    .filter(
      (resource) =>
        resource.Type === 'AWS::IAM::Policy' &&
        resource.Properties.Roles?.some((each) => each.Ref === role),
    )
    .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
    .filter((statement) => !String(statement.Action).startsWith('appsync:'));
  const asset = /^([0-9a-f]{64})\.zip$/.exec(lambda.Properties.Code?.S3Key ?? '')?.[1];
  const code = asset ? readFileSync(join(out, `asset.${asset}`, 'index.mjs'), 'utf8') : '';
  return { properties: lambda.Properties, statements, code };
}

/**
 * The subscription feed's function: the one its public address (a Lambda function URL) points at,
 * found by that address rather than by anything another function might share. Gives its
 * properties, what its role may do, the code it runs as bundled for the deploy, and how many public
 * addresses there are.
 */
function feedFunction() {
  const all = stacks();
  const urls = all.flatMap((stack) =>
    Object.values(stack).filter((resource) => resource.Type === 'AWS::Lambda::Url'),
  );
  const target = urls[0]?.Properties?.TargetFunctionArn?.['Fn::GetAtt']?.[0];
  const lambda = all
    .map((stack) => stack[target])
    .find((resource) => resource?.Type === 'AWS::Lambda::Function');
  if (urls.length !== 1 || !lambda) return { urls, properties: {}, actions: [], code: '' };
  const role = lambda.Properties.Role?.['Fn::GetAtt']?.[0];
  const actions = all
    .flatMap((stack) => Object.values(stack))
    .filter(
      (resource) =>
        resource.Type === 'AWS::IAM::Policy' &&
        resource.Properties.Roles?.some((each) => each.Ref === role),
    )
    .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
    .flatMap((statement) => [statement.Action].flat());
  const asset = /^([0-9a-f]{64})\.zip$/.exec(lambda.Properties.Code?.S3Key ?? '')?.[1];
  const code = asset ? readFileSync(join(out, `asset.${asset}`, 'index.mjs'), 'utf8') : '';
  return { urls, properties: lambda.Properties, actions, code };
}

/**
 * The scheduled run's function: the one a schedule invokes. Gives its schedules, its properties,
 * its settings for being invoked by the schedule, what its role may do outside the data API, and
 * the code it runs as bundled for the deploy.
 */
function scheduledFunction() {
  const all = stacks().flatMap((stack) => Object.entries(stack));
  const schedules = all
    .filter(([, resource]) => resource.Type === 'AWS::Scheduler::Schedule')
    .map(([, resource]) => resource.Properties);
  const targets = new Set(schedules.map((schedule) => schedule.Target?.Arn?.['Fn::GetAtt']?.[0]));
  const [name] = targets.size === 1 ? [...targets] : [];
  const lambda = all.find(
    ([id, resource]) => id === name && resource.Type === 'AWS::Lambda::Function',
  )?.[1];
  const invoke = all
    .filter(([, resource]) => resource.Type === 'AWS::Lambda::EventInvokeConfig')
    .map(([, resource]) => resource.Properties)
    .filter((config) => config.FunctionName?.Ref === name);
  const asset = /^([0-9a-f]{64})\.zip$/.exec(lambda?.Properties.Code?.S3Key ?? '')?.[1];
  const code = asset ? readFileSync(join(out, `asset.${asset}`, 'index.mjs'), 'utf8') : '';
  const role = lambda?.Properties.Role?.['Fn::GetAtt']?.[0];
  const statements = all
    .filter(
      ([, resource]) =>
        resource.Type === 'AWS::IAM::Policy' &&
        resource.Properties.Roles?.some((each) => each.Ref === role),
    )
    .flatMap(([, policy]) => policy.Properties.PolicyDocument.Statement)
    .filter((statement) => !String(statement.Action).startsWith('appsync:'));
  return { schedules, properties: lambda?.Properties ?? {}, invoke, code, statements };
}

/** Every statement of every role's policies that lets it do something in a service, such as 'ses'. */
function statementsFor(service) {
  return resources('AWS::IAM::Policy')
    .flatMap((policy) =>
      (policy.PolicyDocument?.Statement ?? []).map((statement) => ({
        roles: policy.Roles ?? [],
        statement,
      })),
    )
    .filter(({ statement }) =>
      [statement.Action].flat().some((action) => String(action).startsWith(`${service}:`)),
    );
}

/** The words of the step that writes a data API operation's row: the one that holds its condition. */
function writeStep(kind, field) {
  for (const stack of stacks()) {
    for (const { Type, Properties } of Object.values(stack)) {
      if (Type !== 'AWS::AppSync::Resolver' || Properties.TypeName !== kind) continue;
      if (Properties.FieldName !== field) continue;
      return (Properties.PipelineConfig?.Functions ?? [])
        .map((step) => stack[step['Fn::GetAtt']?.[0]]?.Properties ?? {})
        .filter((step) => /DataResolverFn$/.test(step.Name ?? ''))
        .map((step) => stepWords(step, 'Request'))
        .join('\n');
    }
  }
  return '';
}

/** The names of the indexes on a model's table, as synthesized. */
function indexesOf(model) {
  return stacks()
    .map((stack) => stack[`${model}Table`])
    .filter((table) => table?.Type === 'Custom::AmplifyDynamoDBTable')
    .flatMap((table) => table.Properties.globalSecondaryIndexes ?? [])
    .map((index) => index.indexName);
}

/** The hash index the feed reads (LINK_INDEX in amplify/calendar/feed-store.ts). */
const feedIndex = /export const LINK_INDEX = '([^']+)';/.exec(
  readFileSync('amplify/calendar/feed-store.ts', 'utf8'),
)?.[1];

/** What the synthesized backend must say. Each entry is [what is being checked, whether it holds]. */
function checks() {
  const pools = resources('AWS::Cognito::UserPool');
  const clients = resources('AWS::Cognito::UserPoolClient');
  const groups = resources('AWS::Cognito::UserPoolGroup');
  const pool = pools[0] ?? {};
  const client = clients[0] ?? {};
  const queries = openToSignedIn('Query');
  const queryRules = ruleSteps('Query');
  const feed = feedFunction();
  const run = scheduledFunction();
  const claim = writeStep('Mutation', 'createText');
  const retake = writeStep('Mutation', 'updateText');
  const mutations = openToSignedIn('Mutation');
  const subscriptions = openToSignedIn('Subscription');
  const tables = resources('Custom::AmplifyDynamoDBTable');
  const apis = resources('AWS::AppSync::GraphQLApi');
  const rules = resources('AWS::AppSync::FunctionConfiguration').flatMap((step) => [
    stepWords(step, 'Request'),
    stepWords(step, 'Response'),
  ]);
  const tagged = (properties) => {
    const tags = properties.UserPoolTags ?? properties.Tags;
    return Array.isArray(tags)
      ? tags.some((tag) => tag.Key === 'project' && tag.Value)
      : Boolean(tags?.project);
  };
  return [
    ['there is one user pool and one app client', pools.length === 1 && clients.length === 1],
    [
      'nobody can sign up; the owner creates every account',
      pool.AdminCreateUserConfig?.AllowAdminCreateUserOnly === true,
    ],
    ['sign-in is by email', pool.UsernameAttributes?.join() === 'email'],
    ['sign-in has no second step', (pool.MfaConfiguration ?? 'OFF') === 'OFF'],
    [
      'every account must have a display name',
      pool.Schema?.some((attribute) => attribute.Name === 'name' && attribute.Required === true),
    ],
    [
      "an account can be marked as an Admin's",
      groups.some((group) => group.GroupName === 'Admins'),
    ],
    [
      'a session lasts ten years',
      client.RefreshTokenValidity === 3650 && client.TokenValidityUnits?.RefreshToken === 'days',
    ],
    [
      // The rules below are read for a signed-in person and for the backend's own functions.
      // Another way in (a key, a guest, a custom authorizer) would need rules of its own.
      'the only ways into the data API are signing in and being one of the backend functions',
      apis.length === 1 &&
        apis[0].AuthenticationType === 'AMAZON_COGNITO_USER_POOLS' &&
        JSON.stringify(apis[0].AdditionalAuthenticationProviders) ===
          '[{"AuthenticationType":"AWS_IAM"}]' &&
        resources('AWS::AppSync::ApiKey').length === 0,
    ],
    [
      'no rule in the data API tells Susan from an Admin',
      rules.length > 0 && rules.every((words) => !words.includes('cognito:groups')),
    ],
    [
      'anyone signed in can read everything in the calendar',
      MODELS.every((model) => queries.get(`get${model}`) && queries.get(listOf(model))),
    ],
    [
      'anyone signed in is sent every change to an Appointment as it happens',
      ['onCreate', 'onUpdate', 'onDelete'].every((on) => subscriptions.get(`${on}Appointment`)),
    ],
    [
      'anyone signed in is sent every new text and every change to one as it happens',
      ['onCreate', 'onUpdate'].every((on) => subscriptions.get(`${on}Text`)),
    ],
    [
      "the calendar core's commands, and turning app notifications on and off, are the only " +
        'mutations a signed-in person can call',
      [...mutations]
        .filter(([, open]) => open)
        .map(([name]) => name)
        .sort()
        .join() === [...COMMANDS, ...DEVICE_MUTATIONS].sort().join(),
    ],
    [
      'nobody signed in can read or write the devices app notifications go to, or their key',
      CLOSED_MODELS.every(
        (model) =>
          queries.get(`get${model}`) === false &&
          queries.get(`list${model}s`) === false &&
          ['create', 'update', 'delete'].every(
            (verb) => mutations.get(`${verb}${model}`) === false,
          ) &&
          ['onCreate', 'onUpdate', 'onDelete'].every(
            (on) => subscriptions.get(`${on}${model}`) === false,
          ),
      ),
    ],
    [
      'anyone signed in can ask for the public key a device subscribes with',
      queries.get('appNotificationKey') === true,
    ],
    [
      'the app-notifications function may call only the device and key operations it needs',
      appNotificationsAccess().join() === APP_NOTIFICATION_FIELDS.join(),
    ],
    [
      'a device is deleted only if the condition it is deleted on holds when DynamoDB deletes it',
      (() => {
        const words = deviceWriteWords('Delete');
        return (
          words.includes('"operation": "DeleteItem"') &&
          words.includes('$util.qr($ctx.stash.conditions.add($args.condition))') &&
          words.includes('$util.qr($DeleteRequest.put("condition", $Conditions))')
        );
      })(),
    ],
    [
      'a device is kept up to date only if the condition it is written on holds when it is written',
      (() => {
        const words = deviceWriteWords('Update');
        return (
          words.includes('"operation": "UpdateItem"') &&
          words.includes('$util.qr($ctx.stash.conditions.add($args.condition))') &&
          words.includes('$util.qr($UpdateItem.put("condition", $Conditions))')
        );
      })(),
    ],
    [
      // Why a write about a device was refused is read straight from its table, because the data
      // API's reads are eventually consistent (amplify/calendar/app-notification-devices.ts).
      'the app-notifications function may only get single devices from their table, consistently',
      (() => {
        const fn = appNotificationsFunction();
        const table = fn.properties.Environment?.Variables?.APP_NOTIFICATION_DEVICE_TABLE;
        const dynamo = fn.statements.filter((statement) =>
          [statement.Action].flat().some((action) => String(action).startsWith('dynamodb:')),
        );
        const tableArn = JSON.stringify(dynamo[0]?.Resource ?? '');
        return (
          JSON.stringify(table ?? '').includes('AppNotificationDevice') &&
          dynamo.length === 1 &&
          JSON.stringify([dynamo[0].Action].flat()) === '["dynamodb:GetItem"]' &&
          tableArn.includes('AppNotificationDevice') &&
          !tableArn.includes('index') &&
          // Beside it, only what Amplify's data client needs to start: its settings, and the
          // description of the models it reads.
          fn.statements.every(
            (statement) =>
              statement === dynamo[0] ||
              [statement.Action]
                .flat()
                .every(
                  (action) =>
                    action === 'ssm:GetParameters' ||
                    (action === 's3:GetObject' &&
                      JSON.stringify(statement.Resource).includes('modelIntrospectionSchema')),
                ),
          ) &&
          /ConsistentRead:\s*(?:!0|true)\b/.test(fn.code) &&
          !/ConsistentRead:\s*(?:!1|false)\b/.test(fn.code)
        );
      })(),
    ],
    [
      'the commands function can find out who the Admins are, to tell them',
      resources('AWS::IAM::Policy').some((policy) =>
        JSON.stringify(policy.PolicyDocument ?? {}).includes('cognito-idp:ListUsersInGroup'),
      ),
    ],
    [
      "a signed-in person can read their own subscription link and nobody else's",
      OWN_MODELS.every((model) =>
        [`get${model}`, `list${model}s`, `${model[0].toLowerCase()}${model.slice(1)}ByHash`].every(
          (query) => onlyOwn(queryRules.get(query) ?? []),
        ),
      ),
    ],
    [
      'nobody signed in can write calendar data or a subscription link directly',
      [...MODELS, ...OWN_MODELS].every((model) =>
        ['create', 'update', 'delete'].every((verb) => mutations.get(`${verb}${model}`) === false),
      ),
    ],
    [
      "the commands, feed and scheduled run functions are told Susan's time zone",
      resources('AWS::Lambda::Function').filter(
        (lambda) => lambda.Environment?.Variables?.SUSAN_TIME_ZONE,
      ).length === 3 && Boolean(run.properties.Environment?.Variables?.SUSAN_TIME_ZONE),
    ],
    [
      // Every minute, in a cron expression, and one function for it.
      'one scheduled run, every minute, sends the texts that are due',
      run.schedules.length === 1 &&
        /^cron\((?:\*|\*\/1|0\/1) \* \* \* \? \*\)$/.test(run.schedules[0].ScheduleExpression) &&
        run.schedules[0].State === 'ENABLED' &&
        Boolean(run.properties.Handler),
    ],
    [
      // One at a time, finishing within the minute; a run that cannot start is dropped, by the
      // schedule and by Lambda, rather than retried or queued behind the one still going.
      'the scheduled run never overlaps itself',
      run.properties.ReservedConcurrentExecutions === 1 &&
        run.properties.Timeout > 0 &&
        run.properties.Timeout < 60 &&
        run.schedules[0]?.Target?.RetryPolicy?.MaximumRetryAttempts === 0 &&
        run.schedules[0]?.Target?.RetryPolicy?.MaximumEventAgeInSeconds <= 60 &&
        run.invoke.length === 1 &&
        run.invoke[0].MaximumRetryAttempts === 0 &&
        run.invoke[0].MaximumEventAgeInSeconds <= 60,
    ],
    [
      // The claim (claimText in amplify/calendar/data-store.ts): creating a text's record fails
      // when one with its ID is there, so two runs cannot both send it.
      'a text is claimed by creating its record, which fails when the record is already there',
      /"id":\s*\{\s*"attributeExists":\s*false\s*\}/.test(claim) &&
        /"condition":\s*\$condition/.test(claim),
    ],
    [
      // The retake (retakeText in amplify/calendar/data-store.ts): a waiting text is tried again
      // only by the run whose write finds it still as it was read, so two runs cannot both try it.
      'a waiting text is taken up again only by a write whose condition holds as it is written',
      retake.includes('"operation": "UpdateItem"') &&
        retake.includes('$util.qr($ctx.stash.conditions.add($args.condition))') &&
        retake.includes('$util.qr($UpdateItem.put("condition", $Conditions))') &&
        run.code.includes('updateText(input: $input, condition: $condition)') &&
        /status:\s*\{\s*eq:\s*"waiting"\s*\}/.test(run.code),
    ],
    [
      // Alerts (amplify/backend.ts): every Admin, with the address each signs in with, comes from
      // the Admins group.
      'the scheduled run can find out who the Admins are and their addresses, and nothing more',
      (() => {
        const cognito = run.statements.filter((statement) =>
          [statement.Action].flat().some((action) => String(action).startsWith('cognito-idp:')),
        );
        return (
          cognito.length === 1 &&
          JSON.stringify([cognito[0].Action].flat()) === '["cognito-idp:ListUsersInGroup"]' &&
          Boolean(run.properties.Environment?.Variables?.USER_POOL_ID)
        );
      })(),
    ],
    [
      // Alert emails (amplify/calendar/alert-email.ts): the scheduled run alone may send email,
      // and only through identities in its own account and region, which in the SES sandbox must
      // be verified, recipients included. It is told the address to send from (empty for none).
      'only the scheduled run may send email, and only through its own account and region',
      (() => {
        const ses = statementsFor('ses');
        const runRole = run.properties.Role?.['Fn::GetAtt']?.[0];
        const resource = JSON.stringify(ses[0]?.statement.Resource ?? '');
        return (
          ses.length === 1 &&
          ses[0].roles.length === 1 &&
          ses[0].roles[0].Ref === runRole &&
          JSON.stringify([ses[0].statement.Action].flat()) === '["ses:SendEmail"]' &&
          resource.includes(':identity/*') &&
          resource.includes('AWS::Region') &&
          resource.includes('AWS::AccountId') &&
          typeof run.properties.Environment?.Variables?.ALERT_EMAIL_FROM === 'string'
        );
      })(),
    ],
    [
      // An Alert is marked raised by the run whose write finds it still due (changeText in
      // amplify/calendar/data-store.ts), so two runs cannot both raise it.
      'an Alert is raised once, by a write whose condition holds as it is written',
      retake.includes('$util.qr($UpdateItem.put("condition", $Conditions))') &&
        run.code.includes('updateText(input: $input, condition: $condition)') &&
        /\{\s*alert:\s*\{\s*eq:/.test(run.code) &&
        /alert:\s*"raised"/.test(run.code),
    ],
    [
      // The feed has the only public address. Its link is checked inside the function.
      'the subscription feed has the only public address, with a cap on requests at once',
      feed.urls.length === 1 &&
        feed.urls[0].Properties.AuthType === 'NONE' &&
        feed.properties.ReservedConcurrentExecutions > 0,
    ],
    [
      // Its environment names the two tables it reads, from the tables' own stacks.
      'the subscription feed is told the Appointment and SubscriptionLink tables',
      ['Appointment', 'SubscriptionLink'].every((model) =>
        JSON.stringify(
          feed.properties.Environment?.Variables?.[
            model === 'Appointment' ? 'APPOINTMENT_TABLE' : 'SUBSCRIPTION_LINK_TABLE'
          ] ?? '',
        ).includes(`amplifyData${model}${model}Table`),
      ),
    ],
    [
      'the hash index the subscription feed reads is the one on the SubscriptionLink table',
      Boolean(feedIndex) &&
        indexesOf('SubscriptionLink').join() === feedIndex &&
        feed.code.includes(`"${feedIndex}"`),
    ],
    [
      // Its link and the Appointments are read from the tables, because the data API's own reads
      // are not strongly consistent (amplify/calendar/feed-store.ts).
      'the subscription feed may only read the tables, and not through the data API',
      feed.actions.length > 0 &&
        feed.actions.every((action) =>
          ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:Scan'].includes(action),
        ),
    ],
    [
      // Its three table reads (the person's link, an Appointment, every Appointment) are each
      // written with ConsistentRead true, which the bundler writes as `!0`.
      'the subscription feed reads its link and the Appointments with strongly consistent reads',
      (feed.code.match(/ConsistentRead:\s*(?:!0|true)\b/g) ?? []).length >= 3 &&
        !/ConsistentRead:\s*(?:!1|false)\b/.test(feed.code),
    ],
    [
      'every table can be restored to a point in time',
      tables.length === MODELS.length + OWN_MODELS.length + CLOSED_MODELS.length &&
        tables.every(
          (table) => table.pointInTimeRecoverySpecification?.pointInTimeRecoveryEnabled === true,
        ),
    ],
    ['the user pool carries the project cost tag', tagged(pool)],
    [
      'every nested stack carries the project cost tag',
      resources('AWS::CloudFormation::Stack').every(tagged),
    ],
  ];
}

let failed = result.status !== 0;
if (!failed) {
  for (const [what, holds] of checks()) {
    if (holds) continue;
    failed = true;
    console.error(`Backend check failed: ${what}.`);
  }
}
rmSync(out, { recursive: true, force: true });
if (!failed) console.log('Backend synthesized OK.');
process.exit(failed ? 1 : 0);
