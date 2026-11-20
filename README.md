# Susan's Calendar

A small private web app that holds one calendar, Susan's, and texts her a Reminder before each
Appointment. Susan and a handful of Admins sign in to add, change and cancel Appointments. It is an
installable web app on AWS Amplify Gen 2.

- **What it does and why:** [`.scratch/susans-calendar/spec.md`](.scratch/susans-calendar/spec.md)
- **The work, ticket by ticket:** [`.scratch/susans-calendar/issues/`](.scratch/susans-calendar/issues/)
- **The words the project uses:** [`CONTEXT.md`](CONTEXT.md)
- **Chosen layouts:** [`docs/design/`](docs/design/README.md)
- **Setting up text messages:** [`docs/text-message-setup.md`](docs/text-message-setup.md)
- **Why the calendar is written through the data API:** [`docs/adr/0003-the-core-writes-through-the-data-api.md`](docs/adr/0003-the-core-writes-through-the-data-api.md)
- **Why texts go through Textbelt:** [`docs/adr/0002-textbelt-for-text-messages.md`](docs/adr/0002-textbelt-for-text-messages.md), with the research in [`docs/research/`](docs/research/text-message-options.md)
- **Notes for contributors and AI sessions:** [`AGENTS.md`](AGENTS.md) (`CLAUDE.md` is an identical copy)

So far: sign-in, the [public pages](#public-pages), and Appointments with their Reminders. Anyone
signed in can add an Appointment, see the next one in full and the later ones beneath it, open one,
change it, cancel it, and delete one entered by mistake, and is warned when one overlaps another;
what one person changes shows for the others as it happens. Each Appointment carries its Reminders,
showing when each goes out and the exact words Susan will read. The Month tab shows a month at a
glance, and Past lists the Appointments that have already happened. Anyone signed in can also get
their own [calendar subscription](#calendar-subscription) link. Reminders go out on schedule, a
Change notice follows when an Appointment Susan has been texted about moves or is cancelled, and
each Appointment shows every text about it with its status, but no text reaches a phone yet: until
Textbelt is connected (ticket 13) a stand-in records each text instead (see
[Texts to Susan](#texts-to-susan)). Replies arrive with a later ticket.

## Run it locally

Needs Node 22.

```bash
npm install
npm run dev        # http://localhost:5173
```

With no `amplify_outputs.json` in the repo root the app runs on **sample data**: nobody signs in,
nothing is saved, and a notice at the top says so. It starts with a few invented Appointments, which
you can add to and change; a reload starts again. This is the quickest way to work on screens.

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

| Command             | What it does                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`       | Vite dev server                                                                 |
| `npm run build`     | Type-check and build the app into `dist/`                                       |
| `npm run check`     | Lint, format check, type-check, tests, build and synth: run it before finishing |
| `npm run lint`      | ESLint                                                                          |
| `npm run format`    | Prettier, writing changes (`format:check` only reports)                         |
| `npm run typecheck` | TypeScript for the app and `amplify/`                                           |
| `npm test`          | Vitest (`test:watch` reruns on change)                                          |
| `npm run synth`     | Build the backend with no AWS access, then check its rules (see below)          |
| `npm run sandbox`   | Deploy a personal cloud sandbox (`npx ampx sandbox`)                            |
| `npm run icons`     | Redraw the app icons (Python with Pillow)                                       |

GitHub runs lint, format check, type-check, tests, build and synth on every pull request
(`.github/workflows/ci.yml`).

`npm run synth` fails if the backend it built would break a rule the calendar depends on: nobody can
sign up, sign-in has no second step, anyone signed in can read everything in the calendar, the
calendar core's commands (and turning app notifications on and off for a device) are the only way a
signed-in person can change anything, nobody signed in can read the devices app notifications go to
or the key that signs them, the app-notifications function reaches nothing else, a device is only
ever deleted on a condition checked as it is deleted, no rule tells Susan from an Admin, one
scheduled run sends texts every minute and never overlaps itself, a text is claimed by creating its
record, which fails when it is already there, and taken up again only by a conditional write, every table can be restored to a point in time, and
everything carries the cost tag.

## How the calendar is kept

Every rule about the calendar lives in one module, the **calendar core** (`src/lib/calendar/`). It
is the only thing that writes calendar data.

- The app reads Appointments straight from the data API and is sent every change as it happens.
- The app changes the calendar only by calling the core's commands (add, change, cancel and delete an
  Appointment; change the settings; send a test text). They run in a backend function, `calendar-commands`; nothing a signed-in person can
  call writes calendar data any other way.
- Each command is carried out as the signed-in person. The Appointment shows who added it and who
  last changed it, and the calendar keeps a record of each change.
- Adding, changing or cancelling an Appointment sends the other Admins an Activity update: an app
  notification naming who did it and what changed, which opens the Appointment when tapped. The
  person who made the change, and Susan, get none. See [App notifications](#app-notifications).
- The tables can be restored to any moment in the last 35 days, and on `main` they cannot be deleted
  by accident.
- On sample data the same core runs in the browser, over a store kept in memory.

## Texts to Susan

Every minute the `send-texts` backend function runs the calendar core's "run what is due", which
sends each Reminder and Change notice that has come due, once, and keeps a record of every text:
its kind, the Appointment it is about, its words, when it was due, what it told Susan of the
Appointment's date and time, and whether it is waiting, sent, delivered, failed or not sent. The
Appointment's screen shows each Reminder's status and every text about it, with a Change notice
still to go out at the top.

- **Nothing reaches a phone yet.** Until ticket 13 connects Textbelt, texts go to a stand-in that
  records them and sends nothing, in the backend and on sample data alike; Settings says so.
- **Settings → Susan's phone and contact** holds Susan's mobile number, and the name and number the
  automatic answer to a Reply will give her. With no number set, nothing is sent, and each Reminder
  that comes due is recorded as not sent. **Send a test text** sends one by the same path and shows
  its status.
- A Reminder found late is still sent while its Appointment has not started, and recorded as not
  sent once it has. One whose time had already passed when it was set is never sent. None is sent
  for a cancelled Appointment.
- Only one run goes at a time, and each text is claimed before it is sent, so none goes twice. A
  send that might not have gone through is tried again, up to three times, by whichever run takes
  it up first, and only while its Reminder is still the same and its Appointment has not started.
- An exact-time Reminder flagged for review because its Appointment moved is not sent until
  someone keeps it or changes it.
- **Change notices.** Once a text about an Appointment may have reached Susan, a move or a
  cancellation sends her a Change notice, giving the time she was last told and the new time or
  that it is cancelled. It goes five minutes after the last edit, so a run of corrections makes one
  notice about the net change and an edit put back makes none. One that comes up between 9:00 pm
  and 7:00 am, Susan's time, waits until 7:00 am unless the old or new time comes before then.
  Changes to the place, Driver, pickup time or notes send none; later Reminders carry them, and
  Reminders follow a moved Appointment to its new time.
- Logs never hold Susan's number or the words of a text: they say only how many texts ended up in
  each status, and, when something fails, which operation and what kind of failure.

## Calendar subscription

Under **Settings → Calendar subscription**, anyone signed in can get their own link to paste into
Apple Calendar, Google Calendar or Outlook, which then shows Susan's Appointments beside their own.
It is view-only.

- The link is the feed's address with a secret on the end. Only a hash of the secret is kept, so the
  link is shown in full only when it is made. Getting a new link switches off the old one; a person
  can also switch theirs off. Each person's link is their own. A link switched off stops being
  served at once, but a calendar app it was added to may keep showing the copy it last read until
  the calendar is removed there.
- The feed is served by the `subscription-feed` backend function at its own public address (a
  Lambda function URL, passed to the app as `subscriptionFeedUrl` in `amplify_outputs.json`), with
  at most three requests at once. A link that is unknown or switched off gets the same "not found".
- The feed holds active Appointments: what, who with, where, the Driver and pickup time, and the
  Note for Susan. It leaves out Private notes and cancelled Appointments. Each is shown an hour
  long, and times are written in UTC, so they are right in any time zone.
- The feed is read afresh on every request and never cached. It reads the tables itself, with
  strongly consistent reads, because the data API's reads are not; it may only read them, and
  `npm run synth` checks both. Writing still goes only through the calendar core and the data API. How soon a change shows is up to the
  calendar app: Apple Calendar and Outlook can be set to check often; Google Calendar checks on its
  own schedule, which can be several hours.
- Removing a person's account does not switch off their link. Before removing one, delete their row
  from the `SubscriptionLink` table in DynamoDB (it is keyed by their account's `sub`).
- On sample data a link can be made, copied and switched off, but nothing answers at its address.

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
| `APP_URL`         | (leave unset)      | The address app notifications give the push services as their sender. It is worked out from the Amplify app; set it only if the app moves to its own domain.  |

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

- **Display name.** The `name` attribute is what the app shows for the person, and what an
  Appointment shows beside "Added by" and "Last changed by". Every account must have one: if it is
  left out when the account is created, the person is asked for it the first time they sign in. A
  corrected name shows on what the person does from a few minutes later; what they did before keeps
  the name as it was.
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

## App notifications

An Admin turns them on for each phone or laptop in **Settings → App notifications → Turn on for this
device**. On an iPhone the app must be added to the home screen first, and opened from there; the
section says so. From then on that device gets an Activity update whenever someone else adds,
changes or cancels an Appointment. Alerts will arrive the same way (ticket 15).

- They are web push, as in Wellbeing. The key pair that signs them is made by the backend the first
  time anyone turns them on and kept in the data API, so there is no secret to set up. The private
  half never leaves the backend.
- Each device is kept against the account of whoever turned it on. Turning them on in Settings is
  the only way a device changes hands, as when two people share a laptop: the one who turned them
  on last gets them.
- Opening the app only keeps its device up to date for the person who already has it. An older
  session opened on a device someone else has turned them on for since takes nothing; Settings
  there says notifications on this device are not coming to that person, and offers to turn them
  on. Settings shows them as on only when the backend confirms the device is that person's.
- Turning them off, or signing out, forgets the device, but only for that person: the delete is
  made on condition that the device is still theirs at the moment it lands. If it is refused, the
  device's table is read with a strongly consistent read to say why; the data API's own reads can
  lag. Only a device that was forgotten, or that nobody has, lets the browser end its
  subscription. One that is someone else's, or whose owner cannot be read, keeps it for them. If
  the backend cannot be reached at all at sign-out, the subscription is ended anyway, so that this
  person's notifications cannot reach whoever uses the device next.
- A device whose push service says its subscription is gone is forgotten too, unless it was renewed
  or moved since.
- The app-notifications function may call only the device and key operations it needs, and may read
  single devices from their table, and nothing else.
- Tapping one opens its Appointment in the app's window, whatever that window was showing, or in a
  new one.
- Who is an Admin comes from the `Admins` group (see [Accounts](#accounts)). Susan's account is not in
  it, so she never gets them, even on a device she turned them on for.
- Deleting an Appointment entered by mistake sends no Activity update.
