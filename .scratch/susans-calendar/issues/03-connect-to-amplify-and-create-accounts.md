# 03: Connect to Amplify and create accounts

**What to do:** Put the app on the internet and give people a way in. This needs the owner's AWS and GitHub access, so an agent cannot do it.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "Foundations" and "Sign-in and access"; user stories 1 and 96.

**Blocked by:** 01 (Deployable app shell).

**Parallel:** Yes. Independent of 02 and 04. Ticket 05 waits on this one because Twilio needs the public page to be live.

**Status:** ready-for-human

- [ ] A new Amplify app exists in the same AWS account and region as the sibling apps, connected to this repository's `main` branch.
- [ ] The environment values the README lists are set on it (Susan's time zone, the cost tag, the app's address).
- [ ] The first deploy from `main` succeeds and the sign-in screen loads at the app's address.
- [ ] An account exists for Susan and for each Admin, each with a display name, and each Admin's account is marked as an Admin's in the way the README describes.
- [ ] One Admin has signed in successfully on a phone and on a laptop.
- [ ] The app's address is written into the README.
