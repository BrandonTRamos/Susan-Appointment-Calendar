# 05: Get a Textbelt key and send the Confirmation text

**What to do:** Get the key the calendar sends texts with, and send Susan her first text. It needs the owner's payment details and Susan's phone number, so an agent cannot do it.

Follow `docs/text-message-setup.md`. It has the steps for the key, the Confirmation text and the command that sends it.

Until 19 November 2026 this ticket was "Submit Twilio registration and record Susan's consent". ADR 0002 replaced Twilio with Textbelt, which needs no registration, so the registration steps are gone. Susan has already agreed to be texted and the owner holds that agreement, so there is no script to read and nothing to record.

**Spec:** `.scratch/susans-calendar/spec.md`, "Further Notes"; `docs/adr/0002-textbelt-for-text-messages.md`.

**Blocked by:** None. The owner has chosen not to text Susan until the app is built, so the Confirmation text is sent on the day of ticket 18 and not before. Until then every real text goes to the owner's own phone (ticket 13). The sender name can be set at any time.

**Parallel:** Yes. Nothing else waits on it except ticket 18.

**Status:** ready-for-human

- [x] A Textbelt key exists with credit on it. (Bought on 19 November 2026 for the trial recorded in ADR 0002.)
- [ ] The sender name on the key is set to "Susan's Calendar".
- [ ] The Confirmation text has been sent to Susan, as the first text she gets from Textbelt, and its status reached `DELIVERED`.
- [ ] The number it came from is saved in her iPhone contacts under a name she will recognize.
