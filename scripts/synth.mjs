// Synthesizes the Amplify backend with CDK locally, without AWS credentials. It catches CDK and
// bundling errors before a deploy, then checks the sign-in rules, the rules about who may read and
// write calendar data and subscription links, the feed's public address, and the cost tags in what
// was synthesized. Usage: npm run synth
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
    words.split(SIGNED_IN)[1].split(AFTER_SIGNED_IN)[0].replace('#end', '').trim() !== '';
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

/** The calendar core's commands (amplify/data/resource.ts): the only way to change the calendar. */
const COMMANDS = [
  'addAppointment',
  'cancelAppointment',
  'changeAppointment',
  'makeSubscriptionLink',
  'removeAppointment',
  'switchOffSubscriptionLink',
];
/** The calendar (amplify/data/resource.ts). Only the commands function writes these directly. */
const MODELS = ['Appointment', 'ActivityRecord'];
/** Kept per person, and read only by that person. Only the commands function writes these. */
const OWN_MODELS = ['SubscriptionLink'];

/**
 * The subscription feed's function, the one with a cap on requests at once: what its role may do,
 * and the code it runs, as bundled for the deploy.
 */
function feedFunction() {
  const all = stacks();
  const lambda = all
    .flatMap((stack) => Object.values(stack))
    .find(
      (resource) =>
        resource.Type === 'AWS::Lambda::Function' &&
        resource.Properties?.ReservedConcurrentExecutions > 0,
    );
  if (!lambda) return { actions: [], code: '' };
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
  return { actions, code };
}

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
      MODELS.every((model) => queries.get(`get${model}`) && queries.get(`list${model}s`)),
    ],
    [
      'anyone signed in is sent every change to an Appointment as it happens',
      ['onCreate', 'onUpdate', 'onDelete'].every((on) => subscriptions.get(`${on}Appointment`)),
    ],
    [
      "the calendar core's commands are the only mutations a signed-in person can call",
      [...mutations]
        .filter(([, open]) => open)
        .map(([name]) => name)
        .sort()
        .join() === COMMANDS.join(),
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
      "the commands and feed functions are told Susan's time zone",
      resources('AWS::Lambda::Function').filter(
        (lambda) => lambda.Environment?.Variables?.SUSAN_TIME_ZONE,
      ).length === 2,
    ],
    [
      // The feed has the only public address. Its link is checked inside the function.
      'the subscription feed has a public address, with a cap on requests at once',
      resources('AWS::Lambda::Url').length === 1 &&
        resources('AWS::Lambda::Url')[0].AuthType === 'NONE' &&
        resources('AWS::Lambda::Function').filter(
          (lambda) =>
            lambda.ReservedConcurrentExecutions > 0 &&
            lambda.Environment?.Variables?.SUSAN_TIME_ZONE,
        ).length === 1,
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
      tables.length === MODELS.length + OWN_MODELS.length &&
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
