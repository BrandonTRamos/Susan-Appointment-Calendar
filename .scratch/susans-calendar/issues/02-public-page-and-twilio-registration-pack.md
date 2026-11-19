# 02: Public page and Twilio registration pack

**What to build:** Anyone, without signing in, can open a page on the app's address that says what Susan's Calendar is and carries its privacy policy and terms. Alongside it, the owner gets a written pack with everything he needs to paste into Twilio's registration forms and to read to Susan, so that he can submit the registration (ticket 05) without composing anything himself.

Twilio will not review the registration until this page is live, and the review takes up to a week, so this ticket is on the path to the app's critical feature even though it contains no calendar code.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "Settings and public page", "Wording" and "Further Notes"; user story 95. See also `docs/adr/0001-twilio-for-text-messages.md`.

**Blocked by:** 01 (Deployable app shell).

**Parallel:** Yes. Independent of 03 and 04.

**Status:** ready-for-agent

- [ ] A public page is reachable without signing in, at a stable URL, and is linked from the sign-in screen.
- [ ] The page states what the service is (appointment reminders sent by text to one consenting family member), gives a contact email address that the owner can set without a code change, and carries a privacy policy and terms.
- [ ] The privacy policy states that mobile numbers and consent are never shared with third parties.
- [ ] The terms cover what messages are sent and roughly how often, "Message and data rates may apply", and how STOP and HELP work.
- [ ] A registration pack document walks the owner through Twilio's Sole Proprietor brand and campaign registration step by step, with the exact text to paste for each field: campaign description, at least two sample messages in the wording the spec defines, and the description of how consent is collected.
- [ ] The pack contains the consent script to read aloud to Susan, a place to record the date she agreed, and the confirmation text to send her afterwards.
- [ ] Twilio's current documentation has been checked for the fields the forms require and for whether opt-out wording must appear in every message or only in the confirmation. The finding is written in the pack. If it changes how Reminders must be worded, the spec is corrected too.
- [ ] The pack lists the one-time and monthly costs.
- [ ] No real phone number, and nothing about Susan beyond her first name, appears anywhere in the repo.
