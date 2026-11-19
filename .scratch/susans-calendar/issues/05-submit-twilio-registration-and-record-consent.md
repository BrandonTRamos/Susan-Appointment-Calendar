# 05: Submit Twilio registration and record Susan's consent

**What to do:** Register with Twilio as the sender of Susan's texts and get her agreement on record. It needs the owner's identity, payment details and a conversation with Susan, so an agent cannot do it. Twilio's review takes up to about a week; start this as soon as its blockers are done.

Follow the registration pack that ticket 02 produced, `docs/twilio-registration-pack.md`. It has the text for every field and the script to read to Susan. Read its first section before paying anything: Twilio's documentation now says a registration for texting only family members may not be eligible, and the pack has the question to put to Twilio Support. The pack keeps the filled-in record of consent out of this repository, which is public, and explains when to read the script so that the confirmation text can follow it at once.

**Spec:** `.scratch/susans-calendar/spec.md`, "Further Notes"; `docs/adr/0001-twilio-for-text-messages.md`.

**Blocked by:** 02 (Public page and Twilio registration pack), 03 (Connect to Amplify and create accounts). The public page must be live before Twilio will review the registration.

**Parallel:** Yes. Nothing else waits on it except ticket 18.

**Status:** ready-for-human

- [ ] A Twilio account exists, upgraded to paid, with a balance loaded.
- [ ] The Sole Proprietor brand is registered and its one-time code, sent to the owner's own mobile, has been answered.
- [ ] The campaign is submitted with the description, sample messages, consent description, and the privacy policy and terms addresses from the pack.
- [ ] One local number is bought and attached to the campaign.
- [ ] The consent script has been read to Susan, she agreed, and the date is recorded where the pack says to record it.
- [ ] Twilio has approved the campaign. If it is rejected, the reason is written on this ticket and the pack is corrected before resubmitting.
