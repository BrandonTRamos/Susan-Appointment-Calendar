# 05: Get a Textbelt key and record Susan's consent

**What to do:** Get the key the calendar sends texts with, and get Susan's agreement on record. It needs the owner's payment details and a conversation with Susan, so an agent cannot do it.

Follow `docs/text-message-setup.md`. It has the steps for the key, the script to read to Susan, the Confirmation text and the command that sends it, and the record of consent to keep. That record stays out of this repository, which is public.

Until 19 November 2026 this ticket was "Submit Twilio registration and record Susan's consent". ADR 0002 replaced Twilio with Textbelt, which needs no registration, so the registration steps are gone.

**Spec:** `.scratch/susans-calendar/spec.md`, "Further Notes"; `docs/adr/0002-textbelt-for-text-messages.md`.

**Blocked by:** 02 (Public page and Twilio registration pack), 03 (Connect to Amplify and create accounts). The consent script gives Susan the addresses of the terms and the privacy policy, so the Public pages must be live first. The key itself waits on nothing.

**Parallel:** Yes. Nothing else waits on it except ticket 18.

**Status:** ready-for-human

- [x] A Textbelt key exists with credit on it. (Bought on 19 November 2026 for the trial recorded in ADR 0002.)
- [ ] The sender name on the key is set to "Susan's Calendar".
- [ ] The consent script has been read to Susan and she agreed.
- [ ] The Confirmation text was sent to her straight afterwards, and its status reached `DELIVERED`.
- [ ] The date is recorded where the setup document says to record it.
