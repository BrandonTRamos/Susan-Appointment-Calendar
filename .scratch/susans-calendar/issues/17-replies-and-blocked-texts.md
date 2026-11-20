# 17: Replies and blocked texts

**What to build:** When Susan texts back, a person sees it. Her Reply is passed on to every Admin by email and app notification and listed in the app's Replies tab, and she gets an automatic answer telling her nobody reads replies there and who to call. The app never acts on what she wrote. If she texts STOP and her texts are blocked, the Admins are alerted and the app shows a banner until texts get through again. The Admins are also alerted before the prepaid text credit runs out.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "Replies and opt-out" and "Alerts and Activity updates"; user stories 55 to 59, 66, 67. `docs/text-message-setup.md`, "For later tickets", has how Textbelt signs a Reply and what its documentation leaves unsaid.

**Blocked by:** 13 (Textbelt and delivery status), 15 (Alerts).

**Parallel:** Yes, with 18. Nothing else is left to run alongside it.

**Status:** done

**Deferred by the owner (20 November 2026):** the real-phone check of what Textbelt does with STOP, HELP and START is not part of this release, and no sandbox or pre-merge keyword check is required. Two things therefore remain unverified: whether Textbelt passes STOP, HELP or START on to the reply address, and what a send to a number that has opted out returns. Until they are seen, `TEXTBELT_OPTED_OUT_ERRORS` stays empty and nothing is guessed: such a send is an ordinary refusal, failed with an Alert that says "failed"; the "texts are blocked" Alert and banner are built and tested against synthetic sends and reports only; and any of the three words that does reach the reply address is an ordinary Reply. The steps for the check, when the owner chooses to run it, are in `docs/text-message-setup.md`, "Checking STOP and HELP". What is checked live for this release is the smoke check in `docs/text-message-setup.md`, "Checking Replies after a deploy".

**Destination gate (third attempt, approved by the owner):** an automatic answer is tied to the number a Reply came from by a destination ID, made afresh for every change of Susan's number and written with it; Settings saves write only what changed. Settings saved before this ticket stay unbound (Replies passed on, never answered) until saved once to confirm the same number. See the spec, "Replies and opt-out".

- [x] Every text the app sends names the app's reply address, so that her Replies come back to it.
- [x] Texts from Susan arrive at that public endpoint, which checks Textbelt's signature, rejects a call whose timestamp is more than 15 minutes old, and rejects anything else.
- [x] The core records each Reply with its words and time.
- [x] Each Reply is passed on to every Admin by email and by app notification, quoting what she wrote.
- [x] Susan gets the automatic answer, which names the contact person and phone number from Settings.
- [x] The automatic answer is sent at most once in a short period, so a run of Replies does not produce a run of answers.
- [x] The core never interprets a Reply: no word in it can change, cancel or confirm anything.
- [x] The Replies tab lists her Replies, newest first, and the tab shows a count of ones not yet seen.
- [x] When the app learns that texts to Susan are blocked, from an opt-out report or from a blocked send, it raises an Alert saying so and explaining that only she can undo it, by replying START.
- [x] A banner shows on every screen while texts to Susan are blocked, and clears once a text is delivered again.
- [x] One Alert is raised when the text credit recorded by ticket 13 falls below a set number, starting at 20, and not again until the credit has been topped up.
- [x] Tests cover a forged inbound text being rejected, a stale one being rejected, a Reply being passed on, the limit on automatic answers, the blocked-texts Alert and banner, and the low-credit Alert.

**Deferred, not part of this release:**

- What Textbelt does with STOP and HELP has been tried on a real phone: whether a Reply of STOP reaches the reply address, what a send to a number that has opted out returns, and whether HELP gets an answer from Textbelt. The findings are written into the spec's "Further Notes", replacing the "to confirm" items they settle. Deferred by the owner on 20 November 2026; see above.
