// Synthesizes the Amplify backend with CDK locally, without AWS credentials. It catches CDK and
// bundling errors before a deploy, then checks the sign-in rules, the rules about who may read and
// write calendar data, and the cost tags in what was synthesized. Usage: npm run synth
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

/**
 * The data API's operations of one kind ('Query', 'Mutation' or 'Subscription'), by name, each
 * with whether a signed-in person may call it. An operation with no rule at all counts as open, so
 * that it is noticed.
 */
function openToSignedIn(kind) {
  const open = new Map();
  for (const stack of stacks()) {
    for (const { Type, Properties } of Object.values(stack)) {
      if (Type !== 'AWS::AppSync::Resolver' || Properties.TypeName !== kind) continue;
      const rules = (Properties.PipelineConfig?.Functions ?? [])
        .map((step) => stack[step['Fn::GetAtt']?.[0]]?.Properties ?? {})
        .flatMap((step) => [stepWords(step, 'Request'), stepWords(step, 'Response')])
        .filter((words) => words.includes(SIGNED_IN));
      const allows = (words) =>
        words.split(SIGNED_IN)[1].split(AFTER_SIGNED_IN)[0].replace('#end', '').trim() !== '';
      open.set(Properties.FieldName, rules.length === 0 || rules.some(allows));
    }
  }
  return open;
}

/** The calendar core's commands (amplify/data/resource.ts): the only way to change the calendar. */
const COMMANDS = ['addAppointment', 'cancelAppointment', 'changeAppointment', 'removeAppointment'];
/** What is kept (amplify/data/resource.ts). Only the commands function writes these directly. */
const MODELS = ['Appointment', 'ActivityRecord'];

/** What the synthesized backend must say. Each entry is [what is being checked, whether it holds]. */
function checks() {
  const pools = resources('AWS::Cognito::UserPool');
  const clients = resources('AWS::Cognito::UserPoolClient');
  const groups = resources('AWS::Cognito::UserPoolGroup');
  const pool = pools[0] ?? {};
  const client = clients[0] ?? {};
  const queries = openToSignedIn('Query');
  const mutations = openToSignedIn('Mutation');
  const subscriptions = openToSignedIn('Subscription');
  const tables = resources('Custom::AmplifyDynamoDBTable');
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
      'nobody signed in can write calendar data directly',
      MODELS.every((model) =>
        ['create', 'update', 'delete'].every((verb) => mutations.get(`${verb}${model}`) === false),
      ),
    ],
    [
      "the commands function is told Susan's time zone",
      resources('AWS::Lambda::Function').filter(
        (lambda) => lambda.Environment?.Variables?.SUSAN_TIME_ZONE,
      ).length === 1,
    ],
    [
      'every table can be restored to a point in time',
      tables.length === MODELS.length &&
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
