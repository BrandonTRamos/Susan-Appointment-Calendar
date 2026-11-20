# 17: Replies and blocked texts

**What to build:** When Susan texts back, a person sees it. Her Reply is passed on to every Admin by email and app notification and listed in the app's Replies tab, and she gets an automatic answer telling her nobody reads replies there and who to call. The app never acts on what she wrote. If she texts STOP and her texts are blocked, the Admins are alerted and the app shows a banner until texts get through again. The Admins are also alerted before the prepaid text credit runs out.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "Replies and opt-out" and "Alerts and Activity updates"; user stories 55 to 59, 66, 67. `docs/text-message-setup.md`, "For later tickets", has how Textbelt signs a Reply and what its documentation leaves unsaid.

**Blocked by:** 13 (Textbelt and delivery status), 15 (Alerts).

**Parallel:** Yes, with 18. Nothing else is left to run alongside it.

**Status:** ready-for-agent

**Held for the owner:** everything but the real-phone STOP and HELP check is built on `ticket/17-replies-and-blocked-texts`. That check is the owner's, with the owner's own number on a personal sandbox from this branch, before the pull request is opened, following `docs/text-message-setup.md`, "Checking STOP and HELP". Only sanitized result shapes go into the project: no key, phone number, `textId`, balance or words of any text. Its findings go in the spec's "Further Notes", and a refusal it finds goes in `TEXTBELT_OPTED_OUT_ERRORS`. Until then the Textbelt sender recognises no refusal as an opt-out (only synthetic checks cover that path). This ticket is done once that is recorded.

**Destination gate (third attempt, approved by the owner):** an automatic answer is tied to the number a Reply came from by a destination ID, made afresh for every change of Susan's number and written with it; Settings saves write only what changed. Settings saved before this ticket stay unbound (Replies passed on, never answered) until saved once to confirm the same number. See the spec, "Replies and opt-out".

- [x] Every text the app sends names the app's reply address, so that her Replies come back to it.
- [x] Texts from Susan arrive at that public endpoint, which checks Textbelt's signature, rejects a call whose timestamp is more than 15 minutes old, and rejects anything else.
- [x] The core records each Reply with its words and time.
- [x] Each Reply is passed on to every Admin by email and by app notification, quoting what she wrote.
- [x] Susan gets the automatic answer, which names the contact person and phone number from Settings.
- [x] The automatic answer is sent at most once in a short period, so a run of Replies does not produce a run of answers.
- [x] The core never interprets a Reply: no word in it can change, cancel or confirm anything.
- [x] The Replies tab lists her Replies, newest first, and the tab shows a count of ones not yet seen.
- [ ] What Textbelt does with STOP and HELP has been tried on a real phone: whether a Reply of STOP reaches the reply address, what a send to a number that has opted out returns, and whether HELP gets an answer from Textbelt. The findings are written into the spec's "Further Notes", replacing the "to confirm" items they settle.
- [x] When the app learns that texts to Susan are blocked, from an opt-out report or from a blocked send, it raises an Alert saying so and explaining that only she can undo it, by replying START.
- [x] A banner shows on every screen while texts to Susan are blocked, and clears once a text is delivered again.
- [x] One Alert is raised when the text credit recorded by ticket 13 falls below a set number, starting at 20, and not again until the credit has been topped up.
- [x] Tests cover a forged inbound text being rejected, a stale one being rejected, a Reply being passed on, the limit on automatic answers, the blocked-texts Alert and banner, and the low-credit Alert.
