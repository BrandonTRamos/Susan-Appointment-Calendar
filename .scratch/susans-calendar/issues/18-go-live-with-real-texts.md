# 18: Go live with real texts

**What to do:** Switch the app from the stand-in sender to Textbelt and prove that a text reaches Susan's phone. It needs the owner's Textbelt key, Susan's phone number and her phone in hand, so an agent cannot do it.

**Spec:** `.scratch/susans-calendar/spec.md`, "Further Notes"; `docs/adr/0002-textbelt-for-text-messages.md`; `docs/text-message-setup.md`.

**Blocked by:** 05 (Get a Textbelt key and record Susan's consent), 13 (Textbelt and delivery status).

**Parallel:** Yes, with 17.

**Status:** ready-for-human

- [ ] The Textbelt key is stored as the deployment secret the README names, and the app has been redeployed.
- [ ] The key holds enough credit for the first months.
- [ ] Susan's mobile number and the contact name and number are entered in Settings.
- [ ] Susan has had the Confirmation text (ticket 05) before any other text: it is the one that tells her how to stop them.
- [ ] The test text from Settings arrives on Susan's iPhone, and its status in the app reaches "delivered".
- [ ] The test text came from the same number as the Confirmation text, and that number is saved in Susan's iPhone contacts under a name she will recognize.
- [ ] A real Appointment with a Reminder a few minutes ahead has been entered, and the Reminder arrived at the right time with the right words.
- [ ] If ticket 15 is done: a deliberate failure (for example, a test with her number mistyped) produced an Alert by email and by app notification.
- [ ] If ticket 17 is done: a reply from her phone was passed on to the Admins and she received the automatic answer.
