# 17: Replies and blocked texts

**What to build:** When Susan texts back, a person sees it. Her Reply is passed on to every Admin by email and app notification and listed in the app's Replies tab, and she gets an automatic answer telling her nobody reads replies there and who to call. The app never acts on what she wrote. If she texts STOP and her texts are blocked, the Admins are alerted and the app shows a banner until texts get through again. The Admins are also alerted before the prepaid text credit runs out.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "Replies and opt-out" and "Alerts and Activity updates"; user stories 55 to 59, 66, 67. `docs/text-message-setup.md`, "For later tickets", has how Textbelt signs a Reply and what its documentation leaves unsaid.

**Blocked by:** 13 (Textbelt and delivery status), 15 (Alerts).

**Parallel:** Yes, with 18. Nothing else is left to run alongside it.

**Status:** ready-for-agent

- [ ] Every text the app sends names the app's reply address, so that her Replies come back to it.
- [ ] Texts from Susan arrive at that public endpoint, which checks Textbelt's signature, rejects a call whose timestamp is more than 15 minutes old, and rejects anything else.
- [ ] The core records each Reply with its words and time.
- [ ] Each Reply is passed on to every Admin by email and by app notification, quoting what she wrote.
- [ ] Susan gets the automatic answer, which names the contact person and phone number from Settings.
- [ ] The automatic answer is sent at most once in a short period, so a run of Replies does not produce a run of answers.
- [ ] The core never interprets a Reply: no word in it can change, cancel or confirm anything.
- [ ] The Replies tab lists her Replies, newest first, and the tab shows a count of ones not yet seen.
- [ ] What Textbelt does with STOP and HELP has been tried on a real phone: whether a Reply of STOP reaches the reply address, what a send to a number that has opted out returns, and whether HELP gets an answer from Textbelt. The findings are written into the spec's "Further Notes", replacing the "to confirm" items they settle.
- [ ] When the app learns that texts to Susan are blocked, from an opt-out report or from a blocked send, it raises an Alert saying so and explaining that only she can undo it, by replying START.
- [ ] A banner shows on every screen while texts to Susan are blocked, and clears once a text is delivered again.
- [ ] One Alert is raised when the text credit recorded by ticket 13 falls below a set number, starting at 20, and not again until the credit has been topped up.
- [ ] Tests cover a forged inbound text being rejected, a stale one being rejected, a Reply being passed on, the limit on automatic answers, the blocked-texts Alert and banner, and the low-credit Alert.
