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
showing when each goes out and the exact words Susan will read. An Appointment can be made to repeat,
as a [Series](#series). The Month tab shows a month at a
glance, and Past lists the Appointments that have already happened. Anyone signed in can also get
their own [calendar subscription](#calendar-subscription) link. Reminders go out on schedule
through Textbelt, and each Appointment shows every text about it with its status, which moves on to
delivered or failed as Textbelt reports. Until the Textbelt key is stored, a stand-in records each
text instead of sending it (see [Texts to Susan](#texts-to-susan)). Replies arrive with a later
ticket.

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
record, which fails when it is already there, and taken up again only by a conditional write, the
Series top-up runs once a day, one run at a time with its retries bounded, may call only the data
API fields in its access list, and can send no text, Alert or email, the Textbelt key reaches only the
commands function and the scheduled run, and only as a secret, an Alert is taken up and recorded
only by conditional writes, only the scheduled run may send email, only from its configured address
and only through its own account and region, every table can be restored to a point in time, and
everything carries the cost tag.

## How the calendar is kept

Every rule about the calendar lives in one module, the **calendar core** (`src/lib/calendar/`). It
is the only thing that writes calendar data.

- The app reads Appointments straight from the data API and is sent every change as it happens.
- The app changes the calendar only by calling the core's commands (add, change, cancel and delete an
  Appointment; add, change and end a Series; change the settings; send a test text). They run in a
  backend function, `calendar-commands`; nothing a signed-in person can call writes calendar data
  any other way. The other writers are the scheduled run that sends texts, `send-texts`, and the
  daily Series top-up, `series-top-up`, which run the same core.
- Each command is carried out as the signed-in person. The Appointment shows who added it and who
  last changed it, and the calendar keeps a record of each change.
- Adding, changing or cancelling an Appointment sends the other Admins an Activity update: an app
  notification naming who did it and what changed, which opens the Appointment when tapped. The
  person who made the change, and Susan, get none. See [App notifications](#app-notifications).
- The tables can be restored to any moment in the last 35 days, and on `main` they cannot be deleted
  by accident.
- On sample data the same core runs in the browser, over a store kept in memory.

## Series

A repeating commitment, such as dialysis every Monday and Thursday or a monthly check-up, is entered
once: in the Appointment form, **Repeats** makes it repeat every few weeks on chosen days, or every
few months on the day it starts, ending on a date or never.

- Each Appointment in a Series is a real Appointment, with its own Reminders, made ahead as far as
  26 weeks (182 days) from today, or from when the Series starts if that is later. The
  `series-top-up` backend function runs once a day at 08:00 UTC and makes the Appointments each
  Series still needs, so one with no end never runs dry. It records no activity and sends no
  Activity update: nobody acted. If a Series is ended or split while it runs, it takes out again
  any Appointment it made after the new end. It is separate from the scheduled run that sends
  texts, and sends none itself. A failed run is not retried; the next day's catches up.
- Each Reminder of an Appointment in a Series is set when that Appointment is made or changed, by
  the same rule as any other: one whose time has already passed then is never sent.
- Patterns are worked out on Susan's dates, so a weekly 9:00 am stays at 9:00 am across a clock
  change. The first Appointment has to be on a day the pattern gives. A monthly Series on the 29th,
  30th or 31st lands on the last day of a shorter month. A day on which the clocks skip its start
  time is left out for now; how that should work is waiting on the owner (see the spec).
- Reminders set on a Series go out a set time before each Appointment; an exact-time Reminder can be
  added to one Appointment in it.
- Changing or cancelling one asks: **only this one**, which changes it alone and marks it as changed
  on its own, or **this and all later ones**, which ends the Series the day before and continues it
  as a new Series. Later Appointments are replaced, including ones changed on their own: one on a
  date the new Series also has is changed in place, and any other is removed, or cancelled if Susan
  may have been texted about it, which keeps it, and its texts, on record. Cancelling this and all later ones keeps them, marked cancelled. Later ones include those of a Series already continued from a later Appointment, which is replaced or cancelled too. A change or cancellation cut off partway can simply be sent again. Deleting
  one entered by mistake deletes only that one, and the top-up does not bring it back.
- Adding, changing or cancelling a Series leaves one activity record and sends one Activity update,
  not one per Appointment. An Appointment in a Series shows **Repeats** in every list, and how it
  repeats on its detail.

## Texts to Susan

Every minute the `send-texts` backend function runs the calendar core's "run what is due", which
sends each Reminder that has come due, once, and keeps a record of every text: its kind, the
Appointment it is about, its words, when it was due, and whether it is waiting, sent, delivered,
failed or not sent. The Appointment's screen shows each Reminder's status and every text about it.

- **Texts go through Textbelt** once its key is stored (below). Until then, and on sample data, a
  stand-in records each text and sends nothing, and Settings says so.
- **Delivery status.** Textbelt does not report delivery by itself, so each run asks it what became
  of every text that is sent but not yet settled. `DELIVERED` makes the text delivered, `FAILED`
  makes it failed, and anything else leaves it sent. A text with no confirmation 30 minutes after it
  was sent is marked failed as "not confirmed delivered", which the app tells apart from a failure
  Textbelt reported. "Delivered" means her phone company accepted it for her phone; the app never
  says she read it. A text the stand-in recorded is never asked about and stays sent. Texts are
  sent one at a time; the run then asks about statuses a few at a time, the oldest first, so one
  slow answer holds up no other.
- **Refused sends.** A send Textbelt refuses (its answer says `success: false`, such as "Out of
  quota"), whatever the HTTP status, is failed at once and not tried again. An answer that is not
  Textbelt's, such as a gateway's error page, cannot say whether the text went, so it is tried
  again. The credit left on the key, which Textbelt gives with every send, is kept on each
  text's record.
- **No web addresses.** Textbelt does not send a text holding a web address unless the key has been
  given leave to. The calendar sends no text whose words hold one (a link, a "www." address, a
  name such as `example.de`, or an email address), of any kind: it is recorded as not sent, and
  says why. Nothing typed is refused or changed: a Reminder's preview, in the form and on the
  Appointment, warns that it will not be sent, and its status says "Will not be sent" until the
  address is taken out. Such a Reminder is not among those still to be sent on the Upcoming card
  or in the phone Month count, and saving an Appointment whose only Reminders in time are such
  asks first, as saving one with no Reminder does, saying why. The Private notes go in no text, so
  they can hold one.
- **Settings → Susan's phone and contact** holds Susan's mobile number, and the name and number the
  automatic answer to a Reply will give her. With no number set, nothing is sent, and each Reminder
  that comes due is recorded as not sent. **Send a test text** sends one by the same path and shows
  its status as it changes.
- A Reminder found late is still sent while its Appointment has not started, and recorded as not
  sent once it has. One whose time had already passed when it was set is never sent. None is sent
  for a cancelled Appointment.
- Only one run goes at a time, and each text is claimed before it is sent, so none goes twice. A
  send that might not have gone through is tried again, up to three times, by whichever run takes
  it up first, and only while its Reminder is still the same and its Appointment has not started.
- An exact-time Reminder flagged for review because its Appointment moved is not sent until
  someone keeps it or changes it.
- Logs never hold Susan's number, the words of a text or the key: they say only how many texts
  ended up in each status, and, when something fails, which operation and what kind of failure.

### The Textbelt key

The key is the one secret the owner must supply. It is a deployment secret named `TEXTBELT_KEY`,
never written in the repository or kept in the calendar's data. Buy it as in
[`docs/text-message-setup.md`](docs/text-message-setup.md), step 1.

- **On the Amplify app:** **Hosting → Secrets**, add `TEXTBELT_KEY` for all branches, then redeploy.
- **In a sandbox:** `npx ampx sandbox secret set TEXTBELT_KEY`, and paste the key when asked.

Removing the secret puts the stand-in back. Only the `calendar-commands` function (for the test
text) and the `send-texts` function are given it, and `npm run synth` checks that.

### Try real texts on your own phone first

Nothing goes to Susan's phone before go-live (ticket 18). To see real texts before then:

1. Store the key as above and redeploy. Settings no longer says texts are only recorded.
2. In **Settings → Susan's phone and contact**, enter your own mobile number where Susan's will
   later go, and save.
3. Press **Send a test text**. It should arrive within a minute or so, and its status should move
   from Sent to Delivered within a few minutes. Add an Appointment with a Reminder a few minutes
   ahead to see a Reminder arrive, with its words, at its time.
4. Before go-live, replace your number with Susan's (ticket 18).

Every text spends credit, the test text included.

## Alerts

When a text to Susan does not get through, every Admin is told by email and by app notification.
Susan's account is not an Admin's, so she never gets one.

- **When.** A text of any kind (a Reminder, a Change notice, a test text) fails: refused, sending
  did not go through after its tries, or reported not delivered. Or it is marked not confirmed
  delivered (once ticket 13 asks Textbelt), or could not be sent before its Appointment started.
  A text not sent because its words held a web address raises one saying so, without the address.
  A Reminder that was not sent only because Susan's mobile number was not set raises one too,
  worded as a gap in the setup rather than a failure. Until her number is entered (ticket 18),
  that means an Alert for every Reminder that comes due. A Reminder held for review sends nothing
  and raises none. Texts recorded before Alerts existed raise none.
- **Who sends it.** The scheduled run, every minute, after its sends and after it has asked Textbelt
  about every text still only sent. A text that asking settles as not delivered, or not confirmed
  delivered, is settled once, by a conditional write that also marks its Alert due; the Alerts then
  go one delivery at a time, never one burst per answer. A failed test text is marked by the
  command that sent it, and the next run sends its Alert, within a minute.
- **Once, and to everyone.** One text raises one Alert. Each Admin gets it once by email and once
  on each device with app notifications on; each of those is recorded as soon as it goes and never
  sent again. One that failed is tried again by a later run, two minutes on, up to three tries in
  all, while the others are not repeated. One refused for good (an address SES will not send to)
  is recorded as such and never tried again, even while another on the same Alert is retried. One
  with nothing to reach (email not set up, no address, no device turned on) is not tried again
  either: that is not a failure. If a run stops part way, a later run sends only what had not been
  recorded, and a run that stopped on the last of the three tries is not followed by a fourth: what
  had not gone is given up, and the log says how many had gone, never to whom. The one repeat that
  can happen: a delivery that SES or a push service accepted just before the run stopped, before
  the run could record it, goes again from the run that takes over.
- **What it says.** Which Appointment (what it is, its date and time), which text (its kind, and
  when it was due), and why: "failed", "was not confirmed delivered", "could not be sent in time"
  or "was not sent" because her number was not set. A test text's Alert says it was sent from
  Settings. Nothing more personal: never Susan's number, the text's words, the place, the Driver or
  the notes. A phone number typed into an Appointment's name is left out of the Alert, which still
  names it by its date and time. The email ends with a link to the Appointment (or Settings), and tapping the app
  notification opens it.
- **The banner.** While the most recent text to Susan, of any kind, failed or did not get through,
  a banner shows at the top of every screen, with a link to the text. It says what happened to
  that text, so after a missing number is entered it still reads "was not sent: her mobile number
  was not set". It clears once a later text goes: send a test text from Settings to clear it.
- **Setting up the emails.** See [Alert emails](#alert-emails). Without `ALERT_EMAIL_FROM`, Alerts go
  by app notification only, and the scheduled run may not send email at all.

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

| Name                        | Value                               | What it does                                                                                                                                                                                          |
| --------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUSAN_TIME_ZONE`           | `America/New_York`                  | Susan's time zone. Every date and time in the calendar means her local time. US Eastern if unset; a wrong name fails the deploy.                                                                      |
| `COST_TAG`                  | `susans-calendar`                   | The `project` tag on every backend resource and on the Hosting app, so the app's cost shows on its own in billing. This is the default.                                                               |
| `CONTACT_EMAIL`             | your email address                  | The contact address on the [public pages](#public-pages). They say none has been set if it is missing; a value that is not an email address fails the deploy.                                         |
| `OWNER_NAME`                | your full name                      | Who the public pages say runs the calendar. They say "a private individual" if it is missing.                                                                                                         |
| `APP_URL`                   | (leave unset)                       | The address app notifications give the push services as their sender. It is worked out from the Amplify app; set it only if the app moves to its own domain.                                          |
| `TEXT_CONFIRMATION_MINUTES` | (leave unset)                       | How long after it was sent a text with no confirmation of delivery is marked failed as "not confirmed delivered". 30 if unset; anything but a whole number of minutes, up to 10080, fails the deploy. |
| `ALERT_EMAIL_FROM`          | an address you have verified in SES | The address [Alert emails](#alert-emails) come from. Without it, Alerts go by app notification only; a value that is not an email address fails the deploy.                                           |

A change to any of these takes effect at the next deploy. Later tickets add to this table. The
Textbelt key is not one of these: it is a secret (see [The Textbelt key](#the-textbelt-key)).

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

### Alert emails

Alerts are emailed through AWS's email service (SES), in the same region as the Amplify app, to the
address each Admin signs in with. A new AWS account's SES is in the _sandbox_: it can send only from
and to addresses verified in SES, at most 200 emails a day and one a second, separately in each
region (AWS's [production access page](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html),
checked on 20 November 2026). That is plenty for a handful of Admins, so no production access
request is needed. The owner does these steps once; nothing in the repository does them.

1. In the SES console, in the Amplify app's region, open **Identities → Create identity → Email
   address**, enter the address Alerts should come from, and click the link SES emails to it. An
   address at a domain you control is best: mail from a large provider's address sent by SES can be
   marked as spam by that provider's own rules.
2. Do the same for each Admin's sign-in address. Each Admin clicks the link SES sends them. An
   Admin added later needs the same before their Alerts arrive; until then their email is refused
   (logged as `MessageRejected`) and their app notifications still go.
3. Set `ALERT_EMAIL_FROM` to the first address under **Hosting → Environment variables**, and
   redeploy.

The scheduled run may call `ses:SendEmail` and nothing else in SES: only with `ALERT_EMAIL_FROM` as
the From address (the `ses:FromAddress` condition), and only through identities in its own account
and region. AWS's [SES v2 authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html),
read on 20 November 2026, lists `SendEmail` on the `identity` resource with that condition key. The
grant covers every identity in the account and region, not only the sender's, because the sender
may be verified as an address or as its domain, and in the sandbox the recipients are verified
identities too. `npm run synth` checks it. SES charges for each email, and the price depends on the plan the account uses: the à-la-carte
pricing or the Essentials plan. See [AWS's SES pricing](https://aws.amazon.com/ses/pricing/) for
the current figures rather than one written here.

**Try it once, by hand.** In the SES console, **Send test email** from the sender to one Admin's
address proves the two are verified. Then make a text fail on purpose. Once ticket 13 sends real
texts, a test text to a mistyped number does it (ticket 18 asks for this). Before then, add an
Appointment for later today with one Reminder a few minutes ahead and leave Susan's mobile number
empty in Settings. Within a minute of the failure every Admin should get an email and an app
notification, each opening the Appointment or Settings, and the banner should show. Delete the
Appointment afterwards (nothing was sent, so it can be), then send a test text to clear the
banner.

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
changes or cancels an Appointment, and every [Alert](#alerts).

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
