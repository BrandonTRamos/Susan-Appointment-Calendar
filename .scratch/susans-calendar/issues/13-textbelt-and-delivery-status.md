# 13: Textbelt and delivery status

**What to build:** Texts reach a real phone. With the Textbelt key in place, the app sends each text through Textbelt, and the status shown on the Appointment moves on to delivered or failed according to what Textbelt says when asked. A text that is never confirmed delivered is marked so after a set time.

Until 19 November 2026 this ticket was "Twilio and delivery reports". ADR 0002 replaced Twilio with Textbelt, which does not push delivery reports: the app asks for each text's status.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "Sending and tracking texts" and "Further Notes"; user stories 60 and 63. `docs/adr/0002-textbelt-for-text-messages.md` explains why Textbelt and requires that it stay behind one seam. `docs/text-message-setup.md`, "What Textbelt's documentation says", has the requests and answers.

**Blocked by:** 11 (Sending texts on schedule).

**Parallel:** Yes, with 14, 15 and 16. It is built and tested against recorded examples. Once it is merged, the owner can try real texts on the owner's own phone, by storing the key and entering that phone's number in Settings; nothing is sent to Susan's phone before ticket 18.

**Status:** ready-for-agent

- [ ] A Textbelt sender implements the text sender port. Nothing outside it knows about Textbelt.
- [ ] The Textbelt key is held as a deployment secret, never in data or code. Where it is absent, the stand-in sender from ticket 11 is used.
- [ ] A send that Textbelt refuses, such as "Out of quota", is a failed text and is not retried as if it might have gone through.
- [ ] Each run asks Textbelt for the status of every text that is sent but not yet settled, and stops asking once it is delivered, failed, or marked not confirmed.
- [ ] Textbelt's statuses are mapped to the app's in one place: `DELIVERED` to delivered, `FAILED` to failed, and `SENDING`, `SENT` and `UNKNOWN` leave the text as sent.
- [ ] A text with no delivery confirmation after a configurable period, starting at 30 minutes, is marked failed as "not confirmed delivered", distinct from a reported failure.
- [ ] The app never claims a text was read. "Delivered" means the carrier accepted it for her phone.
- [ ] The credit left on the key, which Textbelt returns with every send, is recorded so that ticket 17 can warn when it runs low.
- [ ] No text the app sends holds a web address. A test checks every kind of text.
- [ ] Textbelt's current documentation has been checked against `docs/text-message-setup.md` for the send and status requests and their answers. Anything that has changed is corrected there and in the spec's "Further Notes".
- [ ] Tests against recorded examples cover a refused send, each status mapping, and the unconfirmed case.
- [ ] The README says which secret the owner must supply, and how to try real texts on the owner's own phone before go-live: store the key, and enter that phone's number in Settings where Susan's will later go.
