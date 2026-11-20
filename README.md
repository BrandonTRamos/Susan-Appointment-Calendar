# Susan's Calendar

A small private web app that holds one calendar, Susan's, and texts her a Reminder before each
Appointment. Susan and a handful of Admins sign in to add, change and cancel Appointments. It is an
installable web app on AWS Amplify Gen 2.

- **What it does and why:** [`.scratch/susans-calendar/spec.md`](.scratch/susans-calendar/spec.md)
- **The work, ticket by ticket:** [`.scratch/susans-calendar/issues/`](.scratch/susans-calendar/issues/)
- **The words the project uses:** [`CONTEXT.md`](CONTEXT.md)
- **Chosen layouts:** [`docs/design/`](docs/design/README.md)
- **Setting up text messages:** [`docs/text-message-setup.md`](docs/text-message-setup.md)
- **Why texts go through Textbelt:** [`docs/adr/0002-textbelt-for-text-messages.md`](docs/adr/0002-textbelt-for-text-messages.md), with the research in [`docs/research/`](docs/research/text-message-options.md)
- **Notes for contributors and AI sessions:** [`AGENTS.md`](AGENTS.md) (`CLAUDE.md` is an identical copy)

So far the app is a shell: sign-in, the tabs and a placeholder behind each one, plus the
[public pages](#public-pages). Appointments, Reminders and everything else arrive with the later
tickets.

## Run it locally

Needs Node 22.

```bash
npm install
npm run dev        # http://localhost:5173
```

With no `amplify_outputs.json` in the repo root the app runs on **sample data**: nobody signs in,
nothing is saved, and a notice at the top says so. This is the quickest way to work on screens.

## Run it against a sandbox backend

A sandbox is your own copy of the backend in AWS. It needs AWS credentials for the account the
sibling apps use.

```bash
npm run sandbox    # deploys the sandbox and writes amplify_outputs.json; leave it running
npm run dev        # in a second terminal: now shows the sign-in screen
```

Nobody can sign up, so create an account to sign in with (see [Accounts](#accounts)), in the
sandbox's user pool. Stop the sandbox with Ctrl+C; `npx ampx sandbox delete` removes it from AWS.
`amplify_outputs.json` is never committed.

## Commands

| Command             | What it does                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`       | Vite dev server                                                                  |
| `npm run build`     | Type-check and build the app into `dist/`                                        |
| `npm run check`     | Lint, format check, type-check, tests, build and synth: run it before finishing  |
| `npm run lint`      | ESLint                                                                           |
| `npm run format`    | Prettier, writing changes (`format:check` only reports)                          |
| `npm run typecheck` | TypeScript for the app and `amplify/`                                            |
| `npm test`          | Vitest (`test:watch` reruns on change)                                           |
| `npm run synth`     | Build the backend with no AWS access, then check its sign-in rules and cost tags |
| `npm run sandbox`   | Deploy a personal cloud sandbox (`npx ampx sandbox`)                             |
| `npm run icons`     | Redraw the app icons (Python with Pillow)                                        |

GitHub runs lint, format check, type-check, tests, build and synth on every pull request
(`.github/workflows/ci.yml`).

## Hosting

The app deploys the same way as the sibling apps: one Amplify Hosting app, connected to this
repository's `main` branch, in the same AWS account and region. Every push to `main` runs the tests,
deploys the backend, then builds and publishes the app (`amplify.yml`). A failing test stops the
deploy before anything changes. `customHttp.yml` sets the security headers.

The app is at <https://main.d3o9xocds2v1sa.amplifyapp.com>.

### Environment values

Set these on the Amplify app under **Hosting → Environment variables**, for all branches.

| Name              | Value              | What it does                                                                                                                                                  |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUSAN_TIME_ZONE` | `America/New_York` | Susan's time zone. Every date and time in the calendar means her local time. US Eastern if unset; a wrong name fails the deploy.                              |
| `COST_TAG`        | `susans-calendar`  | The `project` tag on every backend resource and on the Hosting app, so the app's cost shows on its own in billing. This is the default.                       |
| `CONTACT_EMAIL`   | your email address | The contact address on the [public pages](#public-pages). They say none has been set if it is missing; a value that is not an email address fails the deploy. |
| `OWNER_NAME`      | your full name     | Who the public pages say runs the calendar. They say "a private individual" if it is missing.                                                                 |

A change to any of these takes effect at the next deploy. Later tickets add to this table.

### Rewrite rule

Each tab has its own URL, so the Hosting app needs one rule that sends those URLs to the app. It
is the same rule Wellbeing has, under **Hosting → Rewrites and redirects**: source address `/<*>`,
target address `/index.html`, type **404 (Rewrite)**. The app has it.

Without it, reloading a tab or opening a link to one, such as `/month`, shows "not found". The
public pages need it too. With it, the server still marks its answer to those addresses as 404 while
sending the app, so a browser shows the right page but a link preview or an uptime check may call
the page missing. A rule of type **200 (Rewrite)** would answer 200; nothing needs that today.

## Public pages

Three pages open for anyone, with no sign-in. The sign-in screen links to the first.

| Address    | What it shows                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/about`   | What Susan's Calendar is, what it texts and to whom, that Susan agreed, the contact address, and the privacy policy and terms in full |
| `/privacy` | The privacy policy on its own                                                                                                         |
| `/terms`   | The terms on their own                                                                                                                |

They are the plain account of what the calendar texts and what it does with Susan's number. Their
addresses must not change. The contact address and the owner's name come from `CONTACT_EMAIL` and
`OWNER_NAME` above, so neither is written in the repository. The Confirmation text, the first text
Susan gets, is in `src/lib/consent.ts` and in
[`docs/text-message-setup.md`](docs/text-message-setup.md); a test fails if the two differ.

## Accounts

Nobody can create their own account. The owner creates each one, with the AWS CLI or in the Cognito
console. The user pool's ID is in the Cognito console's list of user pools, and in
`amplify_outputs.json` for a sandbox.

```bash
# An account, with the name the calendar should call the person (a first name is enough).
aws cognito-idp admin-create-user --user-pool-id <pool-id> --username <email> \
  --user-attributes Name=email,Value=<email> Name=email_verified,Value=true Name=name,Value=<name>

# For an Admin only: mark the account as an Admin's.
aws cognito-idp admin-add-user-to-group --user-pool-id <pool-id> --username <email> --group-name Admins
```

Cognito emails the person a temporary password, and the app asks them to choose their own the first
time they sign in. The Cognito console can do the same two steps: create the user with a `name`
attribute, then add it to the `Admins` group.

- **Display name.** The `name` attribute is what the app shows for the person and, later, beside each
  change they make. Every account must have one: if it is left out when the account is created, the
  person is asked for it the first time they sign in.
- **Admins.** Susan's account is the one account that is not in the `Admins` group. The group only
  decides who receives Alerts, passed-on Replies and Activity updates. It gives no extra rights:
  everyone signed in can do everything.
- **Staying signed in.** Sign-in is an email and a password, with no code to enter. A person stays
  signed in on a device until they sign out or the owner disables their account. One exception:
  Safari can forget a website's sign-in after seven days without a visit, unless the app has been added
  to the home screen. Add it to the home screen on Susan's iPhone.

## Add it to a phone's home screen

Open the app's address in Safari on an iPhone (or Chrome on Android), then **Share → Add to Home
Screen**. It then opens like an app. When a new version has been deployed, a bar at the top offers
**Refresh**.
