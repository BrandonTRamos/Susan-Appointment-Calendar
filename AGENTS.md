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
- `npm run synth` builds the backend with no AWS access and then checks the sign-in rules and cost tags in the result (`scripts/synth.mjs`). Add a check there when a ticket adds a rule the backend must keep.
- `npm run icons` needs Python with Pillow; `uv run --with pillow python scripts/make-icons.py` supplies it.

## Conventions

- **Layout.** `src/` is the app: `routes/` (one file per screen), `components/`, `lib/` (shared logic and hooks; its pure modules are also imported by `amplify/`), `test/`. `amplify/` is the Gen 2 backend. Styles are hand-built in `src/styles.css`: no component, form, date or state library.
- **Tests sit beside the code** as `*.test.ts(x)`. Screen tests start with `// @vitest-environment jsdom` and check what a person sees; `src/App.test.tsx` renders the whole `<App>`. Tests run in `Pacific/Auckland` (`vite.config.ts`) to prove nothing reads the machine's time zone.
- **Susan's time zone** comes only from `resolveTimeZone` in `src/lib/timeZone.ts`: the `SUSAN_TIME_ZONE` environment value at deploy, US Eastern by default, passed to the app through `amplify_outputs.json`. Read every date and time through it.
- **Two layouts, one switch.** `useDesktopWidth` (`src/lib/useDesktopWidth.ts`) picks the phone layout (bottom tab bar) or the desktop layout (sidebar, current tab, detail panel). `src/styles.css` holds no width queries. Screen tests choose a width with `atWidth` in `src/App.test.tsx`.
- **Each tab has a URL**: a route in `src/App.tsx` and a link in `TABS` in `src/components/Navigation.tsx`. A new tab needs both.
- **Public pages.** `/about`, `/privacy` and `/terms` open with no sign-in (`src/routes/PublicPage.tsx`). `src/Root.tsx` shows them before any session is looked for, outside the app's router, so link to and from them with a plain `<a>`. Keep their addresses. The Confirmation text is in `src/lib/consent.ts` and `docs/text-message-setup.md`: change both together. The contact address and the owner's name come from `CONTACT_EMAIL` and `OWNER_NAME` at deploy, the same way as Susan's time zone; neither is written in the repo.
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
