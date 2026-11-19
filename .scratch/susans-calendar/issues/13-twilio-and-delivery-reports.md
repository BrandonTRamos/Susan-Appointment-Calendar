# 13: Twilio and delivery reports

**What to build:** Texts reach a real phone. With Twilio credentials in place, the app sends each text through Twilio from the registered number, and the status shown on the Appointment moves on to delivered or failed according to what Twilio reports back. A text that is never confirmed delivered is marked so after a set time.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "Sending and tracking texts" and "Further Notes"; user stories 60 and 63. `docs/adr/0001-twilio-for-text-messages.md` explains why Twilio and requires that it stay behind one seam.

**Blocked by:** 11 (Sending texts on schedule).

**Parallel:** Yes, with 14, 15 and 16. It can be built and tested against recorded examples before Twilio has approved the registration; sending to a real phone is checked in ticket 18.

**Status:** ready-for-agent

- [ ] A Twilio sender implements the text sender port. Nothing outside it knows about Twilio.
- [ ] Twilio credentials are held as a deployment secret, never in data or code. Where they are absent, the stand-in sender from ticket 11 is used.
- [ ] Texts are sent from the registered number in the way Twilio's registration requires.
- [ ] Twilio reports delivery to a public endpoint. The endpoint verifies that each report really came from Twilio and rejects anything else.
- [ ] A report moves the text's status to delivered or failed. Twilio's own statuses are mapped to the app's in one place.
- [ ] A text with no delivery confirmation after a configurable period, starting at 30 minutes, is marked failed as "not confirmed delivered", distinct from a reported failure.
- [ ] The app never claims a text was read. "Delivered" means the carrier accepted it for her phone.
- [ ] Twilio's current documentation has been checked for the status values, their timing, and how an opt-out is reported. The findings are written into the spec's "Further Notes", replacing the "to confirm" items they settle.
- [ ] Tests against recorded examples cover a forged report being rejected, each status mapping, and the unconfirmed case.
- [ ] The README says which secret and settings the owner must supply.
