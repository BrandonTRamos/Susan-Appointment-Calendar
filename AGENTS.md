# Agent instructions

`CLAUDE.md` and `AGENTS.md` at the repo root hold the same instructions for different agent tools. They must stay identical: whenever you edit one, make the same change to the other in the same commit. Check with `cmp CLAUDE.md AGENTS.md`, which prints nothing when they match.

## Keep documentation up to date

Documentation is part of every change. When a change makes any document wrong or incomplete, fix that document in the same commit as the change; never leave it for a follow-up. A change is not finished while a document still describes the old behaviour.

Before finishing a change, check each of these and update the ones it affects:

- `CONTEXT.md`: the glossary. Update it when a term is added, renamed, redefined or dropped. Use its terms everywhere, in code, tests, issues and other documents.
- `docs/adr/`: decisions. When a change reverses or departs from an ADR, mark the old ADR as superseded and write a new one explaining why. Do not edit history out of an accepted ADR.
- `.scratch/<feature>/spec.md` and `.scratch/<feature>/issues/`: when what gets built differs from the spec or a ticket, correct the spec or ticket and update its `Status:` line.
- `docs/agents/`: when the issue tracker, triage labels, domain doc layout or the way tickets are worked changes.
- `CLAUDE.md` and `AGENTS.md`: when a convention, command or workflow in them changes. Keep the two identical.
- Any other document in the repo, such as a README, changelog, setup guide or diagram, that mentions what changed.

If you find a document that is already out of date, fix it or tell the owner; do not work around it.

## The project

Susan's Calendar: a private web app that holds Susan's Appointments and texts her Reminders. The spec is `.scratch/susans-calendar/spec.md`; the work is the numbered tickets beside it. It follows the owner's sibling app Wellbeing (the `Wellbeing-App` repository): copy its conventions, and where Wellbeing and Personal Command Center differ, follow Wellbeing.

## Commands

Node 22 (`.nvmrc`). `npm run check` is the gate: lint, format check, type-check, tests, build, and the backend synth check, the same steps as `.github/workflows/ci.yml`. Run it before finishing any change. The single steps are in `package.json`.

- `npm run dev` with no `amplify_outputs.json` runs the app on sample data with nobody signed in. `npm run sandbox` (needs AWS credentials) writes that file; then `npm run dev` shows the sign-in screen.
- `npm run synth` builds the backend with no AWS access and then checks the sign-in rules, who may read and write calendar data, the scheduled run that sends texts, which functions get the Textbelt key and only as a secret, and the cost tags in the result (`scripts/synth.mjs`). Add a check there when a ticket adds a rule the backend must keep.
- `npm run icons` needs Python with Pillow; `uv run --with pillow python scripts/make-icons.py` supplies it.

## Conventions

- **Layout.** `src/` is the app: `routes/` (one file per screen), `components/`, `data/` (how screens read the calendar and call its commands), `lib/` (shared logic and hooks; its pure modules are also imported by `amplify/`), `test/`. `amplify/` is the Gen 2 backend. Styles are hand-built in `src/styles.css`: no component, form, date or state library.
- **The calendar core** is `src/lib/calendar/`, imported only through its `index.ts`. It holds every rule and is the only thing that writes calendar data. It reaches the outside world only through the ports in `ports.ts` (the store, the clock, the text sender, and the Admin messenger that tells Admins anything) and holds no provider-specific code. A new rule goes in the core, with a test in `core.test.ts` that drives its commands against the in-memory stand-ins (`memory.ts`); never in a screen, a function handler or a store. A command the core will not carry out throws a `CalendarRefusal`, whose words are shown to the person as they are.
- **Reading and writing calendar data.** The app reads the data API directly, with live updates, and changes the calendar only through the core's commands: custom mutations in `amplify/data/resource.ts`, run by `amplify/functions/calendar-commands`, which writes through the data API (`amplify/calendar/data-store.ts`, ADR 0003). The scheduled run (`amplify/functions/send-texts`) writes the same way. Calendar models are read-only to anyone signed in, except `SubscriptionLink`, which each person can read only their own of. Screens get both from `useCalendar` (`src/data/CalendarContext.tsx`), backed by `amplifyCalendar.ts`, or by `sampleCalendar.ts` (the same core over the in-memory store) on sample data. A screen never writes calendar data itself.
- **Texts to Susan.** Every text goes through the core's text sender port (`TextSender` in `src/lib/calendar/ports.ts`), which sends and says what became of a text (`delivery`). Textbelt sits behind it in `amplify/calendar/textbelt.ts`, the only code that knows Textbelt's requests, answers and statuses; its statuses are mapped to the app's there and nowhere else. `amplify/calendar/text-sender.ts` uses it when the deployment secret `TEXTBELT_KEY` is stored, and otherwise the stand-in (`createStandInSender` in `memory.ts`), which records each text instead of sending it and names none of them, so none is asked about. The app asks which is in use through the `textSender` query, since the secret can be stored after a deploy. The core keeps a `Text` record of each text, claimed before sending by creating it under an ID made from what it is about and when it was due (`src/lib/calendar/texts.ts`). `amplify/functions/send-texts` runs `runDue` every minute, one run at a time. Susan's number and the reply contact are the `CalendarSettings` model, changed only by the `changeSettings` command. A Reminder's `setAt` says when its due time was last worked out. Any code that makes or changes a Reminder must set it, because a Reminder whose time had passed by then is never sent. A waiting text is taken up again only through the conditional `retakeText`. Each run then asks the sender about every sent text it named, and marks it delivered or failed, or failed as not confirmed delivered once `unconfirmedAfter` has passed (`TEXT_CONFIRMATION_MINUTES` at deploy, 30 by default). The credit left is kept on each text's record (`creditLeft`). No text may hold a web address (`holdsWebAddress` in `texts.ts`): the core refuses one in any detail a text carries and never sends words that hold one. A test in `core.test.ts` checks every kind of text for one; a new kind of text joins it. Logs and error messages never hold Susan's number or a text's words. Where they could, log with `logFailure` (`amplify/calendar/log.ts`), which says only the operation and the kind of failure, and throw a fresh error with no cause.
- **App notifications** are web push, as in Wellbeing. The devices they go to, and the key pair that signs them, are closed to everyone signed in: `amplify/functions/app-notifications` keeps them, through the `appNotificationKey`, `turnOnAppNotifications` and `turnOffAppNotifications` operations, and the core's Admin messenger (`amplify/calendar/admin-messenger.ts`) sends to them. That function's data API access is narrowed to those device and key operations in `amplify/backend.ts`. Only turning them on (`turnOnAppNotifications`) moves a device to a person; opening the app renews it (`renewAppNotifications`) only if it is already theirs. Every write that depends on whose a device is goes through the conditional `deleteAppNotificationDevice` or `updateAppNotificationDevice` in `amplify/calendar/app-notification-devices.ts`, on condition that it is still the person's (or still the same gone subscription) when DynamoDB writes it; never through the model's plain `delete` or `update`. Why one was refused is read from the device table with a strongly consistent `GetItem`, never the data API's lagging reads, and when it cannot be read the answer is `unconfirmed`, which never lets the browser drop its subscription. `npm run synth` checks all of it. In the app, `src/lib/appNotifications.ts` handles the device in hand, given a `DeviceRegistry` through `<App devices>` (none on sample data), and `public/app-notifications-sw.js` shows them and opens what a tapped one is about. The core writes every word of an Activity update (`src/lib/calendar/activityUpdate.ts`).
- **Tests sit beside the code** as `*.test.ts(x)`. Screen tests start with `// @vitest-environment jsdom`, render the whole `<App>` on a sample calendar with `renderApp` (`src/test/renderApp.tsx`), and check what a person sees. Tests run in `Pacific/Auckland` (`vite.config.ts`) to prove nothing reads the machine's time zone.
- **Susan's time zone** comes only from `resolveTimeZone` in `src/lib/timeZone.ts`: the `SUSAN_TIME_ZONE` environment value at deploy, US Eastern by default, passed to the app through `amplify_outputs.json` and to backend functions as their own `SUSAN_TIME_ZONE`. Read every date and time through it. An Appointment's date and times are kept as Susan's local date (`YYYY-MM-DD`) and clock time (`HH:MM`); `src/lib/localTime.ts` turns them into moments and into words. Never use a `Date` method that reads the machine's zone (`getHours`, `toLocaleString` with no `timeZone`, `new Date(year, month, day)`).
- **Two layouts, one switch.** `useDesktopWidth` (`src/lib/useDesktopWidth.ts`) picks the phone layout (bottom tab bar) or the desktop layout (sidebar, current tab, detail panel). `src/styles.css` holds no width queries; a style for one layout is scoped by `.app.phone` or `.app.desktop`. An Appointment's addresses are a full screen on a phone, with no tab bar, and fill the detail panel on a desktop, beside the tab it was opened from (`Layout` in `src/App.tsx`; `usePickedFrom` in `src/components/Navigation.tsx` gives the phone's way back). A screen in the panel is told so by `useInPanel` (`src/components/Page.tsx`); `Page` then gives it a second-level heading and no way back. Screen tests choose a width with `atWidth` in `src/test/renderApp.tsx`.
- **Each tab has a URL**: a route in `src/App.tsx` and a link in `TABS` in `src/components/Navigation.tsx`. A new tab needs both. An Appointment has URLs too: `/appointments/new`, `/appointments/<id>` and `/appointments/<id>/edit`.
- **Public pages.** `/about`, `/privacy` and `/terms` open with no sign-in (`src/routes/PublicPage.tsx`). `src/Root.tsx` shows them before any session is looked for, outside the app's router, so link to and from them with a plain `<a>`. Keep their addresses. The Confirmation text is in `src/lib/consent.ts` and `docs/text-message-setup.md`: change both together. The contact address and the owner's name come from `CONTACT_EMAIL` and `OWNER_NAME` at deploy, the same way as Susan's time zone; neither is written in the repo.
- **Calendar subscription feed.** `amplify/functions/subscription-feed` serves each person's Subscription link at a public Lambda function URL (`amplify/backend.ts`); the core decides whether a link works and writes the iCalendar feed (`src/lib/calendar/feed.ts`). The feed reads the Appointment and SubscriptionLink tables itself, read-only and with strongly consistent reads, because the data API's reads are not (`amplify/calendar/feed-store.ts`); `npm run synth` checks both. Its core is given `NO_ADMIN_MESSENGER`, so it tells no Admin anything. The secret is the whole path: never log it, and answer an unknown link and a switched-off one identically.
- **Settings sections are separate files** under `src/routes/settings/`, one per section, so tickets that fill different sections never touch the same file.
- **Accounts.** The owner creates every account by hand (README, "Accounts"). The display name is the `name` attribute; an Admin's account is in the `Admins` group, and Susan's is the one account outside it. The group grants no rights. The sign-in rules live in `amplify/auth/resource.ts` and `amplify/backend.ts`.
- **Appearance** follows the device, light or dark, through CSS variables in `src/styles.css`. Base type is 18px and controls are at least 52px tall; keep new screens at that scale.
- **Hosting.** `amplify.yml` runs the tests before every deploy; `customHttp.yml` sets the security headers. The content security policy allows only same-origin scripts, so keep scripts out of `index.html`. Every backend resource carries the `project` cost tag (`amplify/cost-tags.ts`).

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Working the tickets

Before starting, assigning or merging any ticket in `.scratch/`, read `docs/agents/manager.md`: how a ticket is claimed, how workers are briefed, the gate before a pull request, and when to stop for the owner.
