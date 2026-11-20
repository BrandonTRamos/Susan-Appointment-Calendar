// Synthesizes the Amplify backend with CDK locally, without AWS credentials. It catches CDK and
// bundling errors before a deploy, then checks the sign-in rules, the rules about who may read and
// write calendar data, subscription links and agent keys, the public addresses of the feed, the
// MCP server and the reply address and what each may reach, the scheduled run that sends texts,
// passes on Replies and raises Alerts, the Textbelt key's secret, the daily Series top-up's
// schedule and access, and the cost tags in what was synthesized. Usage: npm run synth
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = mkdtempSync(join(tmpdir(), 'susans-calendar-synth-'));
/** The address Alert emails come from, as the owner sets it at deploy (ALERT_EMAIL_FROM). */
const ALERTS_FROM = 'alerts@example.com';
const result = spawnSync('npx', ['tsx', 'amplify/backend.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ALERT_EMAIL_FROM: ALERTS_FROM,
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

/** The data API's schema, as it was synthesized: kept in the stack or in a file beside it. */
function schemaWords() {
  const [schema] = resources('AWS::AppSync::GraphQLSchema');
  if (typeof schema?.Definition === 'string') return schema.Definition;
  const file = /[0-9a-f]{64}\.graphql/.exec(JSON.stringify(schema?.DefinitionS3Location ?? ''));
  return file ? readFileSync(join(out, `asset.${file[0]}`), 'utf8') : '';
}

/** The fields of one type or input in a schema, by name, each with its type as written. */
function fieldsOf(schema, kind, name) {
  const body = new RegExp(`^${kind} ${name}\\b[^{]*\\{([^}]*)\\}`, 'm').exec(schema)?.[1] ?? '';
  return new Map(
    [...body.matchAll(/^\s*(\w+):\s*(\S+)/gm)].map(([, field, type]) => [field, type]),
  );
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
const listOf = (model) =>
  model.endsWith('y')
    ? `list${model.slice(0, -1)}ies`
    : `list${model}${model.endsWith('s') ? '' : 's'}`;

/** The calendar core's commands (amplify/data/resource.ts): the only way to change the calendar. */
const COMMANDS = [
  'addAppointment',
  'addSeries',
  'cancelAppointment',
  'changeAppointment',
  'changeSeries',
  'endSeries',
  'changeSettings',
  'makeAgentKey',
  'makeSubscriptionLink',
  'revokeAgentKey',
  'removeAppointment',
  'seeReplies',
  'sendTestText',
  'switchOffSubscriptionLink',
];
/**
 * The calendar, its Series, the record of texts, and the settings (amplify/data/resource.ts). Only
 * the commands function, the scheduled run and the Series top-up write these directly.
 */
const MODELS = [
  'Appointment',
  'Series',
  'ActivityRecord',
  'Text',
  'CalendarSettings',
  'Reply',
  'CalendarAlert',
];
/** Kept per person, and read only by that person. Only the commands function writes these. */
const OWN_MODELS = ['SubscriptionLink', 'RepliesSeen', 'AgentKey'];
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

/** All the reply address's function may call in the data API (amplify/backend.ts). */
const TEXT_REPLIES_FIELDS = ['Mutation/createReply', 'Query/getCalendarSettings'];

/** The data API fields a function's access.ts lists, as 'Type/field', sorted. */
function accessList(file) {
  const words = readFileSync(file, 'utf8');
  const of = (type) =>
    [...(new RegExp(`${type}: \\[([^\\]]*)\\]`).exec(words)?.[1] ?? '').matchAll(/'(\w+)'/g)].map(
      ([, field]) => `${type}/${field}`,
    );
  return [...of('Query'), ...of('Mutation')].sort();
}
/** All the Series top-up may call in the data API: SERIES_TOP_UP_FIELDS in its access.ts. */
const SERIES_TOP_UP_FIELDS = accessList('amplify/functions/series-top-up/access.ts');
/** All the MCP server may call in the data API: MCP_SERVER_FIELDS in its access.ts. */
const MCP_SERVER_FIELDS = accessList('amplify/functions/mcp-server/access.ts');
/**
 * What a function's role may call in the data API, as 'Type/field', or 'Type/*' for a whole type.
 * Its role is the one its own policies name, found by the start of its ID.
 */
function dataApiAccess(rolePrefix) {
  return stacks()
    .flatMap((stack) => Object.values(stack))
    .filter(
      (resource) =>
        resource.Type === 'AWS::IAM::Policy' &&
        resource.Properties.Roles?.some((each) =>
          new RegExp(`^${rolePrefix}`).test(each.Ref ?? ''),
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
function deviceWriteWords(verb, model = 'AppNotificationDevice') {
  return stacks()
    .flatMap((stack) => Object.entries(stack))
    .filter(
      ([id, resource]) =>
        resource.Type === 'AWS::AppSync::FunctionConfiguration' &&
        id.startsWith(`Mutation${verb}${model}DataResolverFn`),
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

/** Every public address (a Lambda function URL), across the stacks. */
function publicAddresses() {
  return stacks().flatMap((stack) =>
    Object.values(stack).filter((resource) => resource.Type === 'AWS::Lambda::Url'),
  );
}

/**
 * A function with a public address, found by the start of its ID: the subscription feed
 * (`subscriptionfeedlambda`) or the MCP server (`mcpserverlambda`). Gives the public addresses that
 * point at it, its properties, what its role may do outside the data API (`statements`, and their
 * actions), and the code it runs as bundled for the deploy.
 */
function publicFunction(prefix) {
  const all = stacks().flatMap((stack) => Object.entries(stack));
  const [name, lambda] =
    all.find(
      ([id, resource]) =>
        resource.Type === 'AWS::Lambda::Function' && new RegExp(`^${prefix}[0-9A-F]+$`).test(id),
    ) ?? [];
  const urls = publicAddresses().filter(
    (url) => name && url.Properties?.TargetFunctionArn?.['Fn::GetAtt']?.[0] === name,
  );
  if (!lambda) return { urls, properties: {}, statements: [], actions: [], code: '' };
  const role = lambda.Properties.Role?.['Fn::GetAtt']?.[0];
  const every = all
    .filter(
      ([, resource]) =>
        resource.Type === 'AWS::IAM::Policy' &&
        resource.Properties.Roles?.some((each) => each.Ref === role),
    )
    .flatMap(([, policy]) => policy.Properties.PolicyDocument.Statement);
  // Every action, the data API's included, so that reaching it at all is seen.
  const actions = every.flatMap((statement) => [statement.Action].flat());
  const statements = every.filter((statement) => !String(statement.Action).startsWith('appsync:'));
  const asset = /^([0-9a-f]{64})\.zip$/.exec(lambda.Properties.Code?.S3Key ?? '')?.[1];
  const code = asset ? readFileSync(join(out, `asset.${asset}`, 'index.mjs'), 'utf8') : '';
  return { urls, properties: lambda.Properties, statements, actions, code };
}

/**
 * A scheduled function, found by the start of its ID: the scheduled run (`sendtextslambda`) or the
 * Series top-up (`seriestopuplambda`). Gives the schedules that invoke it, its properties, its
 * settings for being invoked by them, what its role may do outside the data API, and the code it
 * runs as bundled for the deploy.
 */
function scheduledFunction(prefix) {
  const all = stacks().flatMap((stack) => Object.entries(stack));
  const [name, lambda] =
    all.find(
      ([id, resource]) =>
        resource.Type === 'AWS::Lambda::Function' && new RegExp(`^${prefix}[0-9A-F]+$`).test(id),
    ) ?? [];
  const schedules = all
    .filter(([, resource]) => resource.Type === 'AWS::Scheduler::Schedule')
    .map(([, resource]) => resource.Properties)
    .filter((schedule) => name && schedule.Target?.Arn?.['Fn::GetAtt']?.[0] === name);
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

/** The code a function runs as bundled for the deploy, by the name its definition gives it. */
function functionCode(name) {
  const lambda = stacks()
    .flatMap((stack) => Object.entries(stack))
    .find(
      ([id, resource]) =>
        resource.Type === 'AWS::Lambda::Function' &&
        new RegExp(`^${name}lambda[0-9A-F]+$`).test(id),
    )?.[1];
  const asset = /^([0-9a-f]{64})\.zip$/.exec(lambda?.Properties.Code?.S3Key ?? '')?.[1];
  return asset ? readFileSync(join(out, `asset.${asset}`, 'index.mjs'), 'utf8') : '';
}

/** Every function, by the logical ID its definition gives it, with its environment. */
function functions() {
  return stacks()
    .flatMap((stack) => Object.entries(stack))
    .filter(([, resource]) => resource.Type === 'AWS::Lambda::Function')
    .map(([id, resource]) => ({ id, variables: resource.Properties.Environment?.Variables ?? {} }));
}

/** What Amplify puts in a secret's variable until the function starts and reads the secret. */
const UNRESOLVED_SECRET = '<value will be resolved during runtime>';

/**
 * The functions given the Textbelt key (amplify/calendar/text-sender.ts), as the IDs of their
 * definitions, sorted, each only as a secret read when it starts: its variable holds Amplify's
 * placeholder, never a key, and the secret's own name is where Amplify looks for it.
 */
function textbeltKeyHolders() {
  return functions()
    .filter(({ variables }) => 'TEXTBELT_KEY' in variables)
    .filter(({ variables }) => {
      const secrets = JSON.parse(
        typeof variables.AMPLIFY_SSM_ENV_CONFIG === 'string'
          ? variables.AMPLIFY_SSM_ENV_CONFIG
          : '{}',
      );
      return (
        variables.TEXTBELT_KEY === UNRESOLVED_SECRET &&
        /\/TEXTBELT_KEY$/.test(secrets.TEXTBELT_KEY?.path ?? '') &&
        /\/TEXTBELT_KEY$/.test(secrets.TEXTBELT_KEY?.sharedPath ?? '')
      );
    })
    .map(({ id }) => /^([a-z]+)lambda[0-9A-F]+$/.exec(id)?.[1] ?? id)
    .sort();
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
  const feed = publicFunction('subscriptionfeedlambda');
  const mcp = publicFunction('mcpserverlambda');
  const commandsFn = scheduledFunction('calendarcommandslambda');
  const replies = publicFunction('textreplieslambda');
  /** The logical ID of the reply address, the function URL that points at the text-replies function. */
  const repliesUrlIds = stacks()
    .flatMap((stack) => Object.entries(stack))
    .filter(
      ([, resource]) =>
        resource.Type === 'AWS::Lambda::Url' &&
        /^textreplieslambda[0-9A-F]+$/.test(
          resource.Properties?.TargetFunctionArn?.['Fn::GetAtt']?.[0] ?? '',
        ),
    )
    .map(([id]) => id);
  const run = scheduledFunction('sendtextslambda');
  const topUp = scheduledFunction('seriestopuplambda');
  const claim = writeStep('Mutation', 'createText');
  const retake = writeStep('Mutation', 'updateText');
  const replyClaim = writeStep('Mutation', 'createReply');
  const replyChange = writeStep('Mutation', 'updateReply');
  const alertClaim = writeStep('Mutation', 'createCalendarAlert');
  const alertChange = writeStep('Mutation', 'updateCalendarAlert');
  const seenChange = writeStep('Mutation', 'updateRepliesSeen');
  const commandsCode = functionCode('calendarcommands');
  const conditional = (words) =>
    words.includes('"operation": "UpdateItem"') &&
    words.includes('$util.qr($ctx.stash.conditions.add($args.condition))') &&
    words.includes('$util.qr($UpdateItem.put("condition", $Conditions))');
  const createsOnce = (words) =>
    /"id":\s*\{\s*"attributeExists":\s*false\s*\}/.test(words) &&
    /"condition":\s*\$condition/.test(words);
  /** The function URL a variable names, by the logical ID of its resource. */
  const urlOf = (value) => JSON.stringify(value ?? '');
  const schema = schemaWords();
  const told = fieldsOf(schema, 'type', 'Told');
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
      'anyone signed in is sent every new Reply and calendar Alert, and every change to one',
      ['Reply', 'CalendarAlert'].every((model) =>
        ['onCreate', 'onUpdate'].every((on) => subscriptions.get(`${on}${model}`)),
      ),
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
      dataApiAccess('appnotificationslambdaServiceRole').join() === APP_NOTIFICATION_FIELDS.join(),
    ],
    [
      // It only keeps a Reply; the scheduled run passes it on and answers her.
      "the reply address's function may only read the settings and create a Reply in the data API",
      dataApiAccess('textreplieslambdaServiceRole').join() === TEXT_REPLIES_FIELDS.join(),
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
    ['anyone signed in can ask which text sender is in use', queries.get('textSender') === true],
    [
      // As a secret, never in the code or the data: only the commands function, for the test text,
      // the scheduled run, and the reply address, to check Textbelt's signature, are given it, and
      // nothing else holds a TEXTBELT_KEY at all.
      'only the commands function, the scheduled run and the reply address get the Textbelt key, as a secret',
      textbeltKeyHolders().join() === 'calendarcommands,sendtexts,textreplies' &&
        functions().filter(({ variables }) => 'TEXTBELT_KEY' in variables).length === 3,
    ],
    [
      // So that Susan's Replies come back to the calendar (amplify/calendar/textbelt.ts).
      'both functions that send texts are told the reply address, to name in every text',
      replies.urls.length === 1 &&
        functions()
          .filter(({ id }) => /^(calendarcommands|sendtexts)lambda[0-9A-F]+$/.test(id))
          .map(({ variables }) => urlOf(variables.REPLY_WEBHOOK_URL))
          .filter(
            (value) =>
              repliesUrlIds.length === 1 &&
              value.includes(repliesUrlIds[0]) &&
              value.includes('FunctionUrl'),
          ).length === 2,
    ],
    [
      'the scheduled run is told how long a text may go unconfirmed, in minutes',
      /^\d+$/.test(run.properties.Environment?.Variables?.TEXT_CONFIRMATION_MINUTES ?? ''),
    ],
    [
      'the commands function can find out who the Admins are, to tell them',
      resources('AWS::IAM::Policy').some((policy) =>
        JSON.stringify(policy.PolicyDocument ?? {}).includes('cognito-idp:ListUsersInGroup'),
      ),
    ],
    [
      "a signed-in person can read their own subscription link and nobody else's",
      ['getSubscriptionLink', 'listSubscriptionLinks', 'subscriptionLinkByHash'].every((query) =>
        onlyOwn(queryRules.get(query) ?? []),
      ),
    ],
    [
      "a signed-in person can read which Replies they have seen and nobody else's",
      ['getRepliesSeen', listOf('RepliesSeen')].every((query) =>
        onlyOwn(queryRules.get(query) ?? []),
      ),
    ],
    [
      "a signed-in person can read their own agent keys and nobody else's",
      ['getAgentKey', 'listAgentKeys'].every((query) => onlyOwn(queryRules.get(query) ?? [])) &&
        [...queryRules.keys()].filter((query) => /AgentKey/i.test(query)).length === 2,
    ],
    [
      // revokeAgentKey (amplify/calendar/data-store.ts): no earlier read decides it, so a key
      // revoked the moment it is made is still revoked, and nobody else's is.
      "an agent key is revoked only by a delete on condition that it is the person's, decided as DynamoDB deletes it",
      (() => {
        const words = deviceWriteWords('Delete', 'AgentKey');
        return (
          words.includes('"operation": "DeleteItem"') &&
          words.includes('$util.qr($ctx.stash.conditions.add($args.condition))') &&
          words.includes('$util.qr($DeleteRequest.put("condition", $Conditions))') &&
          commandsFn.code.includes('deleteAgentKey(input: { hash: $hash }, condition: $condition)')
        );
      })(),
    ],
    [
      'nobody signed in can write calendar data or a subscription link directly',
      [...MODELS, ...OWN_MODELS].every((model) =>
        ['create', 'update', 'delete'].every((verb) => mutations.get(`${verb}${model}`) === false),
      ),
    ],
    [
      "the commands, feed, scheduled run, Series top-up, MCP server and reply address functions are told Susan's time zone",
      resources('AWS::Lambda::Function').filter(
        (lambda) => lambda.Environment?.Variables?.SUSAN_TIME_ZONE,
      ).length === 6 &&
        Boolean(replies.properties.Environment?.Variables?.SUSAN_TIME_ZONE) &&
        Boolean(mcp.properties.Environment?.Variables?.SUSAN_TIME_ZONE) &&
        Boolean(run.properties.Environment?.Variables?.SUSAN_TIME_ZONE) &&
        Boolean(topUp.properties.Environment?.Variables?.SUSAN_TIME_ZONE),
    ],
    [
      'the Series top-up runs once a day, one run at a time, with its retries bounded',
      topUp.schedules.length === 1 &&
        /^cron\(\d+ \d+ \* \* \? \*\)$/.test(topUp.schedules[0].ScheduleExpression) &&
        topUp.schedules[0].State === 'ENABLED' &&
        topUp.properties.ReservedConcurrentExecutions === 1 &&
        topUp.schedules[0].Target?.RetryPolicy?.MaximumRetryAttempts <= 2 &&
        topUp.schedules[0].Target?.RetryPolicy?.MaximumEventAgeInSeconds <= 3600 &&
        topUp.invoke.length === 1 &&
        topUp.invoke[0].MaximumRetryAttempts === 0,
    ],
    [
      // Its list in access.ts, which a test proves is what its code calls, and nothing more: no
      // activity record, and no text written.
      'the Series top-up may call only the data API fields its access list names',
      SERIES_TOP_UP_FIELDS.length === 9 &&
        dataApiAccess('seriestopuplambdaServiceRole').join() === SERIES_TOP_UP_FIELDS.join() &&
        !SERIES_TOP_UP_FIELDS.some((field) => /ActivityRecord|Text$|Texts$|Settings/.test(field)),
    ],
    [
      // Outside the data API it reads only what the data API client needs to start: no email, no
      // accounts, no Textbelt key. It sends no text, Alert or app notification.
      'the Series top-up can send no text, Alert or email, and read no account',
      topUp.statements.length > 0 &&
        topUp.statements.every((statement) =>
          [statement.Action]
            .flat()
            .every((action) => ['s3:GetObject', 'ssm:GetParameters'].includes(action)),
        ) &&
        Object.keys(topUp.properties.Environment?.Variables ?? {}).every(
          (name) => !/TEXTBELT|ALERT|USER_POOL/.test(name),
        ),
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
      // What each text told Susan (Told in src/lib/calendar/texts.ts) is kept on its own record,
      // written by the claim and by the retake, so it outlives any later change to the Appointment.
      // The scheduled run works out Change notices from it (src/lib/calendar/changeNotices.ts).
      "every text's record keeps what it told Susan, from which the scheduled run works out Change notices",
      fieldsOf(schema, 'type', 'Text').get('told') === 'Told' &&
        told.get('date') === 'AWSDate!' &&
        told.get('time') === 'String!' &&
        told.get('cancelled') === 'Boolean!' &&
        ['CreateTextInput', 'UpdateTextInput'].every(
          (input) => fieldsOf(schema, 'input', input).get('told') === 'ToldInput',
        ) &&
        run.code.includes('changeNotice:'),
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
      // only from the configured address, and only through identities in its own account and
      // region. It is told the address to send from.
      'only the scheduled run may send email, only from its configured address, in its own account and region',
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
          JSON.stringify(ses[0].statement.Condition) ===
            JSON.stringify({ StringEquals: { 'ses:FromAddress': ALERTS_FROM } }) &&
          run.properties.Environment?.Variables?.ALERT_EMAIL_FROM === ALERTS_FROM
        );
      })(),
    ],
    [
      // An Alert is taken up, and its progress recorded, only by the run whose write finds it as it
      // read it, in the same state and taken up at the same moment (changeText in
      // amplify/calendar/data-store.ts), so two runs cannot both send it.
      'an Alert is sent by one run at a time, by writes whose condition holds as they are written',
      retake.includes('$util.qr($UpdateItem.put("condition", $Conditions))') &&
        run.code.includes('updateText(input: $input, condition: $condition)') &&
        /\{\s*alert:\s*\{\s*eq:/.test(run.code) &&
        /\{\s*alertTriedAt:\s*\{\s*eq:/.test(run.code),
    ],
    [
      // The feed, the MCP server and the reply address have the only public addresses, one each.
      // The feed's link, the MCP server's agent key and the reply address's signature are checked
      // inside each function.
      'the subscription feed, the MCP server and the reply address have the only public addresses, each with a cap on requests at once',
      publicAddresses().length === 3 &&
        [feed, mcp, replies].every(
          (fn) =>
            fn.urls.length === 1 &&
            fn.urls[0].Properties.AuthType === 'NONE' &&
            fn.properties.ReservedConcurrentExecutions > 0 &&
            fn.properties.ReservedConcurrentExecutions <= 5,
        ),
    ],
    [
      // Its list in access.ts, which tests prove is what its code calls: Appointments, Series, the
      // texts about an Appointment, activity records, and the devices Activity updates go to.
      'the MCP server may call only the data API fields its access list names, and no settings, link, key or text write',
      MCP_SERVER_FIELDS.length === 14 &&
        dataApiAccess('mcpserverlambdaServiceRole').join() === MCP_SERVER_FIELDS.join() &&
        !MCP_SERVER_FIELDS.some((field) =>
          /Settings|SubscriptionLink|AgentKey|Mutation\/\w*Text$|Query\/(get|list)Texts?$/.test(
            field,
          ),
        ),
    ],
    [
      // Outside the data API: one consistent read of a key by its hash, its person's account and
      // the Admins group, and what the data API client needs to start. No email, no Textbelt key.
      'the MCP server may only get single agent keys from their table, consistently, and look up accounts',
      (() => {
        const dynamo = mcp.statements.filter((statement) =>
          [statement.Action].flat().some((action) => String(action).startsWith('dynamodb:')),
        );
        const cognito = mcp.statements.filter((statement) =>
          [statement.Action].flat().some((action) => String(action).startsWith('cognito-idp:')),
        );
        const tableArn = JSON.stringify(dynamo[0]?.Resource ?? '');
        const variables = mcp.properties.Environment?.Variables ?? {};
        return (
          dynamo.length === 1 &&
          JSON.stringify([dynamo[0].Action].flat()) === '["dynamodb:GetItem"]' &&
          tableArn.includes('AgentKey') &&
          !tableArn.includes('index') &&
          JSON.stringify(variables.AGENT_KEY_TABLE ?? '').includes('AgentKey') &&
          cognito.length === 1 &&
          JSON.stringify([cognito[0].Action].flat().sort()) ===
            '["cognito-idp:AdminGetUser","cognito-idp:ListUsersInGroup"]' &&
          Boolean(variables.USER_POOL_ID) &&
          mcp.statements.every(
            (statement) =>
              statement === dynamo[0] ||
              statement === cognito[0] ||
              [statement.Action]
                .flat()
                .every(
                  (action) =>
                    action === 'ssm:GetParameters' ||
                    (action === 's3:GetObject' &&
                      JSON.stringify(statement.Resource).includes('modelIntrospectionSchema')),
                ),
          ) &&
          Object.keys(variables).every((name) => !/TEXTBELT|ALERT/.test(name)) &&
          /ConsistentRead:\s*(?:!0|true)\b/.test(mcp.code) &&
          !/ConsistentRead:\s*(?:!1|false)\b/.test(mcp.code)
        );
      })(),
    ],
    [
      // amplify/calendar/textbelt.ts: Textbelt's HMAC over the timestamp and the raw body, compared
      // in constant time, and a timestamp no more than 15 minutes from now.
      "the reply address checks Textbelt's signature, in constant time, and the timestamp",
      replies.code.includes('timingSafeEqual') &&
        replies.code.includes('x-textbelt-signature') &&
        replies.code.includes('x-textbelt-timestamp') &&
        replies.code.includes('createHmac'),
    ],
    [
      // The reply address keeps nothing itself and reads no table: it goes through the data API.
      'the reply address may not reach any table, email or the user pool directly',
      replies.statements
        .flatMap((statement) => [statement.Action].flat())
        .every(
          (action) =>
            action === 'ssm:GetParameters' ||
            action === 's3:GetObject' ||
            String(action).startsWith('logs:'),
        ),
    ],
    [
      // advanceRepliesSeen in amplify/calendar/data-store.ts: a first mark is a create that fails
      // when one is there, and a later one an update conditioned on the kept mark being earlier.
      "a person's mark of the Replies seen only ever moves on, by conditional writes",
      conditional(seenChange) &&
        // Keyed by person, the create's condition is that no row has the key (modelObjectKey).
        (() => {
          const create = writeStep('Mutation', 'createRepliesSeen');
          return (
            create.includes('"operation": "PutItem"') &&
            create.includes('$ctx.stash.metadata.modelObjectKey') &&
            /"attributeExists":\s*false/.test(create)
          );
        })() &&
        commandsCode.includes('updateRepliesSeen(input: $input, condition: $condition)') &&
        /\{\s*seenUpTo:\s*\{\s*lt:/.test(commandsCode),
    ],
    [
      // The claim (claimReply in amplify/calendar/data-store.ts): the same Reply arriving twice is
      // kept once, and so is the same calendar Alert.
      'a Reply and a calendar Alert are each created once, by a write that fails when it is there',
      createsOnce(replyClaim) && createsOnce(alertClaim),
    ],
    [
      // As a text's Alert: answered and passed on, or sent, only by the run whose write finds it as
      // it read it (changeReply and changeCalendarAlert in amplify/calendar/data-store.ts).
      'a Reply and a calendar Alert are each sent by one run at a time, by conditional writes',
      conditional(replyChange) &&
        conditional(alertChange) &&
        run.code.includes('updateReply(input: $input, condition: $condition)') &&
        run.code.includes('updateCalendarAlert(input: $input, condition: $condition)') &&
        /\{\s*passOnTriedAt:\s*\{\s*eq:/.test(run.code) &&
        /\{\s*answer:\s*\{\s*eq:/.test(run.code),
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
