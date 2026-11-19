# 17: Replies and blocked texts

**What to build:** When Susan texts back, a person sees it. Her Reply is passed on to every Admin by email and app notification and listed in the app's Replies tab, and she gets an automatic answer telling her nobody reads replies there and who to call. The app never acts on what she wrote. If she texts STOP and the carrier starts blocking her texts, the Admins are alerted and the app shows a banner until texts get through again.

**Spec:** `.scratch/susans-calendar/spec.md`, section "Replies and opt-out"; user stories 55 to 59, 66, 67.

**Blocked by:** 13 (Twilio and delivery reports), 15 (Alerts).

**Parallel:** Yes, with 18. Nothing else is left to run alongside it.

**Status:** ready-for-agent

- [ ] Texts from Susan arrive at a public endpoint that verifies each one really came from Twilio and rejects anything else.
- [ ] The core records each Reply with its words and time.
- [ ] Each Reply is passed on to every Admin by email and by app notification, quoting what she wrote.
- [ ] Susan gets the automatic answer, which names the contact person and phone number from Settings.
- [ ] The automatic answer is sent at most once in a short period, so a run of Replies does not produce a run of answers.
- [ ] The core never interprets a Reply: no word in it can change, cancel or confirm anything.
- [ ] The Replies tab lists her Replies, newest first, and the tab shows a count of ones not yet seen.
- [ ] When the app learns that texts to Susan are blocked, from an opt-out report or from a blocked send, it raises an Alert saying so and explaining how she can undo it.
- [ ] A banner shows on every screen while texts to Susan are blocked, and clears once a text is delivered again.
- [ ] Tests cover a forged inbound text being rejected, a Reply being passed on, the limit on automatic answers, and the blocked-texts Alert and banner.
