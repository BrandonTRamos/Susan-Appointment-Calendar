# 18: Go live with real texts

**What to do:** Point the app at Susan's phone and prove that a text reaches it. Until this ticket, real texts have gone only to the owner's own phone. It needs the owner's Textbelt key, Susan's phone number and her phone in hand, so an agent cannot do it.

**Spec:** `.scratch/susans-calendar/spec.md`, "Further Notes"; `docs/adr/0002-textbelt-for-text-messages.md`; `docs/text-message-setup.md`.

**Blocked by:** 05 (Get a Textbelt key and send the Confirmation text), 13 (Textbelt and delivery status).

**Parallel:** Yes, with 17.

**Status:** ready-for-human

- [ ] The Textbelt key is stored as the deployment secret the README names, and the app has been redeployed. (It may already be, from trying the app on the owner's phone.)
- [ ] The key holds enough credit for the first months.
- [ ] An account exists for Susan and for each Admin, each with a display name, and each Admin's account is marked as an Admin's (README, "Accounts"). Ticket 03 created only the owner's.
- [ ] The mobile number in Settings is Susan's, replacing the owner's own if that was entered for the trial, and the contact name and number are entered.
- [ ] Susan has had the Confirmation text (ticket 05) before any other text: it is the one that tells her how to stop them.
- [ ] The test text from Settings arrives on Susan's iPhone, and its status in the app reaches "delivered".
- [ ] The test text came from the same number as the Confirmation text, the one saved in Susan's iPhone contacts in ticket 05.
- [ ] A real Appointment with a Reminder a few minutes ahead has been entered, and the Reminder arrived at the right time with the right words.
- [ ] If ticket 15 is done: a deliberate failure (for example, a test with her number mistyped) produced an Alert by email and by app notification.
- [ ] If ticket 17 is done: a reply from her phone was passed on to the Admins and she received the automatic answer.
