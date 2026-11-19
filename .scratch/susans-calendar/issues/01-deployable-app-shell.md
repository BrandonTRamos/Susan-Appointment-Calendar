# 01: Deployable app shell

**What to build:** A person with an account can sign in with an email and password and land on an empty Susan's Calendar: the phone layout with its bottom tab bar, the desktop layout with its sidebar and three columns, and a placeholder page behind every tab. Nothing about Appointments exists yet. The repo goes from empty to a project that builds, passes every check, and is ready for the owner to connect to hosting.

This is the foundation every other ticket builds on, so it follows the sibling apps closely. Read Wellbeing first and copy its conventions; where Wellbeing and Personal Command Center differ, follow Wellbeing.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "Foundations", "Sign-in and access" and "Screens"; user stories 2 to 8, 80, 81, 96, 97, 98. Design references in `docs/design/`.

**Blocked by:** None (can start immediately).

**Parallel:** No. Every other ticket waits on this one.

**Status:** done

- [x] The project is a single-package Vite, React and TypeScript app with an Amplify Gen 2 backend, following Wellbeing's layout, URL-based routing, linting, formatting, type-checking, test setup, backend synth check and GitHub checks workflow.
- [x] Sign-in is email and password with no second step. There is no way to sign up. Sessions are long-lived so a person rarely signs in again. Every account has a display name, and an account can be marked as an Admin's when the owner creates it.
- [x] A signed-out visitor sees only the sign-in screen. A signed-in person sees the app and can sign out.
- [x] At phone width there is a bottom tab bar with Upcoming, Month, Replies and Settings.
- [x] At desktop width there are three columns: a sidebar (app name, a "New Appointment" button, and Upcoming, Month, Past, Replies, Settings), a middle column for the current tab, and a right-hand region reserved for the detail panel. Compare `docs/design/desktop-upcoming.png`.
- [x] Each tab has its own URL and shows a placeholder page. Reloading or sharing a URL returns to the same tab.
- [x] The Settings page has four empty, clearly separated sections that later tickets fill in without touching each other: "Susan's phone and contact", "App notifications", "Calendar subscription" and "Agent keys".
- [x] Type is large and controls are plain throughout, in both light and dark appearance.
- [x] With no backend configuration the app runs on sample data, as the sibling apps do.
- [x] The app can be added to a phone's home screen and offers an update prompt when a new version is available.
- [x] Deployment configuration matches the sibling apps: tests gate the deploy, security headers are set, every backend resource carries a cost tag, and configuration (including Susan's time zone, US Eastern) is read from the environment.
- [x] Linting, format check, type-check, tests, build and the synth check all pass locally and in the checks workflow.
- [x] `AGENTS.md` and `CLAUDE.md` gain the project's commands and conventions, and remain identical. A README explains how to run the app locally and against a sandbox backend.
- [x] Nothing is deployed and nothing is pushed to `main`. Connecting hosting is ticket 03, which is the owner's.
