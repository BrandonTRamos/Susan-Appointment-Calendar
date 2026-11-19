// Synthesizes the Amplify backend with CDK locally, without AWS credentials. It catches CDK and
// bundling errors before a deploy, then checks the sign-in rules and cost tags in what was
// synthesized. Usage: npm run synth
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

/** Every resource of a type, across the root stack and its nested stacks. */
function resources(type) {
  return readdirSync(out)
    .filter((file) => file.endsWith('.template.json'))
    .flatMap((file) => Object.values(JSON.parse(readFileSync(join(out, file), 'utf8')).Resources))
    .filter((resource) => resource.Type === type)
    .map((resource) => resource.Properties ?? {});
}

/** What the synthesized backend must say. Each entry is [what is being checked, whether it holds]. */
function checks() {
  const pools = resources('AWS::Cognito::UserPool');
  const clients = resources('AWS::Cognito::UserPoolClient');
  const groups = resources('AWS::Cognito::UserPoolGroup');
  const pool = pools[0] ?? {};
  const client = clients[0] ?? {};
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
