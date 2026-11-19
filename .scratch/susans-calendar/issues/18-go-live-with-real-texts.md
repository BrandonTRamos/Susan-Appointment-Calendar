# 18: Go live with real texts

**What to do:** Switch the app from the stand-in sender to Twilio and prove that a text reaches Susan's phone. It needs the owner's Twilio credentials, Susan's phone number and her phone in hand, so an agent cannot do it.

**Spec:** `.scratch/susans-calendar/spec.md`, "Further Notes"; `docs/adr/0001-twilio-for-text-messages.md`.

**Blocked by:** 05 (Submit Twilio registration and record Susan's consent), 13 (Twilio and delivery reports).

**Parallel:** Yes, with 17.

**Status:** ready-for-human

- [ ] The Twilio credentials are stored as the deployment secret the README names, and the app has been redeployed.
- [ ] Twilio is pointed at the app's two public addresses, for delivery reports and for incoming texts, as the README describes.
- [ ] Susan's mobile number and the contact name and number are entered in Settings.
- [ ] The confirmation text from the registration pack has been sent to her, as the first text she gets from the number: Twilio requires the opt-out wording in the first message.
- [ ] The test text from Settings arrives on Susan's iPhone, and its status in the app reaches "delivered".
- [ ] The sending number is saved in Susan's iPhone contacts under a name she will recognize.
- [ ] A real Appointment with a Reminder a few minutes ahead has been entered, and the Reminder arrived at the right time with the right words.
- [ ] If ticket 15 is done: a deliberate failure (for example, a test with her number mistyped) produced an Alert by email and by app notification.
- [ ] If ticket 17 is done: a reply from her phone was passed on to the Admins and she received the automatic answer.
