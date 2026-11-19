# 15: Alerts

**What to build:** When a text to Susan does not get through, every Admin is told by email and by app notification, with enough detail to know what to say when they call her. While the problem stands, a banner shows on every screen of the app. Susan never receives Alerts.

**Spec:** `.scratch/susans-calendar/spec.md`, section "Alerts and Activity updates"; user stories 61 to 65, 67, 68.

**Blocked by:** 08 (App notifications and Activity updates), 11 (Sending texts on schedule).

**Parallel:** Yes, with 13, 14 and 16. It does not wait for Twilio: an Alert is raised for any text that reaches a failed or not-sent status, whatever caused it, so the failures ticket 13 introduces raise Alerts without further work.

**Status:** ready-for-agent

- [ ] The Admin messenger gains an email channel, sending to the address each Admin signs in with.
- [ ] Whether AWS's email service can send to a handful of individually verified addresses without a separate production approval has been confirmed. If it cannot, the fallback in the spec is used. The outcome is written into the spec, replacing the "to be confirmed" note, and the README lists any step the owner must take.
- [ ] An Alert goes to every Admin by email and by app notification when a text to Susan fails, when one is marked not confirmed delivered, and when a Reminder could not be sent in time.
- [ ] An Alert says which Appointment and which text it concerns and why it is being raised, and distinguishes "failed" from "not confirmed delivered".
- [ ] Susan never receives an Alert by either channel.
- [ ] One failed text raises one Alert, not one per run.
- [ ] A banner appears on every screen while the most recent text to Susan failed, and clears once a later text succeeds.
- [ ] Alerts carry no more personal detail than the reader needs, and never Susan's phone number.
- [ ] Tapping an Alert opens the Appointment it concerns.
- [ ] Tests through the core cover each route to an Alert, that Susan is excluded, and that an Alert is raised once. A screen test covers the banner appearing and clearing.
