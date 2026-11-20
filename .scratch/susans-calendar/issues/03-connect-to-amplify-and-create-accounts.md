# 03: Connect to Amplify and create accounts

**What to do:** Put the app on the internet and give people a way in. This needs the owner's AWS and GitHub access, so an agent cannot do it.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "Foundations" and "Sign-in and access"; user stories 1 and 96.

**Blocked by:** 01 (Deployable app shell).

**Parallel:** Yes. Independent of 02 and 04.

**Status:** done

- [x] A new Amplify app exists in the same AWS account and region as the sibling apps, connected to this repository's `main` branch.
- [x] The environment values the README lists are set on it (Susan's time zone, the cost tag, and the contact address and owner's name for the public pages).
- [x] The rewrite rule the README gives is set on it, so that reloading a tab or opening a link to one works.
- [x] The first deploy from `main` succeeds and the sign-in screen loads at the app's address.
- [x] An account exists for the owner, with a display name, marked as an Admin's in the way the README describes. Susan's account and the other Admins' accounts are created later, at the owner's choice; ticket 18 now checks for them.
- [x] One Admin has signed in successfully on a phone and on a laptop.
- [x] The app's address is written into the README.

## Comments

**Done (19 November 2026).**

- The app is `Susan-Appointment-Calendar` in the same account and region as the sibling apps, at <https://main.d3o9xocds2v1sa.amplifyapp.com>.
- `CONTACT_EMAIL` and `OWNER_NAME` are set. `SUSAN_TIME_ZONE` and `COST_TAG` are left unset, which gives the defaults the README names: US Eastern and `susans-calendar`.
- The rewrite rule is Wellbeing's (`/<*>` to `/index.html`, type 404), not the 200 rewrite the README first gave. Every address shows the right page in a browser, but the server marks the answer 404. That mattered only while a text-message registration was to be reviewed against the Public pages (ADR 0002 ended that), so the README now describes the rule the app has.
- Only the owner's account exists so far. The owner chose to add Susan's and the other Admins' accounts later, so that check moved to ticket 18.
- The owner reported signing in on a phone and a laptop; the account shows as confirmed.
