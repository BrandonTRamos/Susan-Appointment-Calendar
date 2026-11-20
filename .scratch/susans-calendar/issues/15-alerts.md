# 15: Alerts

**What to build:** When a text to Susan does not get through, every Admin is told by email and by app notification, with enough detail to know what to say when they call her. While the problem stands, a banner shows on every screen of the app. Susan never receives Alerts.

**Spec:** `.scratch/susans-calendar/spec.md`, section "Alerts and Activity updates"; user stories 61 to 65, 67, 68.

**Blocked by:** 08 (App notifications and Activity updates), 11 (Sending texts on schedule).

**Parallel:** Yes, with 13, 14 and 16. It does not wait for Textbelt: an Alert is raised for any text that reaches a failed or not-sent status, whatever caused it, so the failures ticket 13 introduces raise Alerts without further work.

**Status:** done

- [x] The Admin messenger gains an email channel, sending to the address each Admin signs in with.
- [x] Whether AWS's email service can send to a handful of individually verified addresses without a separate production approval has been confirmed. If it cannot, the fallback in the spec is used. The outcome is written into the spec, replacing the "to be confirmed" note, and the README lists any step the owner must take.
- [x] An Alert goes to every Admin by email and by app notification when a text to Susan fails, when one is marked not confirmed delivered, and when a Reminder could not be sent in time.
- [x] An Alert says which Appointment and which text it concerns and why it is being raised, and distinguishes "failed" from "not confirmed delivered".
- [x] Susan never receives an Alert by either channel.
- [x] One failed text raises one Alert, not one per run.
- [x] A banner appears on every screen while the most recent text to Susan failed, and clears once a later text succeeds.
- [x] Alerts carry no more personal detail than the reader needs, and never Susan's phone number.
- [x] Tapping an Alert opens the Appointment it concerns.
- [x] Tests through the core cover each route to an Alert, that Susan is excluded, and that an Alert is raised once. A screen test covers the banner appearing and clearing.

## As built

- **The email channel.** The Admin messenger port (`AdminMessenger` in `src/lib/calendar/ports.ts`) gains `sendEmail`. In the backend (`amplify/calendar/admin-messenger.ts`) it lists the `Admins` group for each Admin's sign-in address and emails each one on their own through SES's v2 `SendEmail` (`amplify/calendar/alert-email.ts`), from `ALERT_EMAIL_FROM`, set at deploy. A person ID that is not an Admin's reaches no address. The adapter spaces emails a little over a second apart, tries again when SES is busy or does not answer (up to three tries), and treats any other refusal, such as `MessageRejected` for an address the sandbox has not verified, as final. It logs only the error's name. Without `ALERT_EMAIL_FROM`, no email is sent and Alerts go by app notification only. It is tested against synthetic SES answers; nothing reached AWS.
- **The sandbox question.** AWS's documentation, checked on 20 November 2026, says the SES sandbox sends from verified identities to verified addresses, 200 a day and one a second, per region. That is enough, so the fallback is not used. The spec says so, and the README's "Alert emails" lists the owner's steps: verify the sending address and each Admin's address in the app's region, set `ALERT_EMAIL_FROM`, and try it once by hand. An email has not yet been sent for real; that is the owner's live test.
- **Routes.** `alertMarked` (`src/lib/calendar/alerts.ts`) marks a Reminder's or Change notice's Alert due in the same write that settles its record as failed (any reason), or as not sent with the reason `tooLate` or `noNumber`. Every write of a text's record in the core goes through it, so the failures ticket 13 adds raise Alerts with no further work. A Reminder not sent only because no number is set is told apart from one that could not be sent in time and from a failure: its own subject and words say her number is not set. Test texts and automatic answers raise none. A text whose record has no `alert` (one recorded before this ticket) raises none, so old failures do not flood the Admins after the deploy.
- **The seam for ticket 13.** A text's record gains `alert` (`due`, `raised` or null) and two reasons, `undelivered` and `unconfirmed`. The core gains `recordDelivery({ textId, outcome })`, with the provider-neutral outcomes `delivered`, `undelivered` and `unconfirmed` (`deliveredText` in `alerts.ts`). It changes only a text still recorded as sent, once, through the store's conditional `changeText`, and raises the Alert at once. Ticket 13 maps Textbelt's statuses and its 30-minute period onto these outcomes and needs nothing from this branch beyond them.
- **Raised once.** The scheduled run raises every Alert that is due, after sending, by `changeText` from `due` to `raised` on condition that it is still due, so two runs cannot both raise it. A run that stopped before raising one leaves it due for the next run. When the email or the app notification cannot be sent, the other still goes; when neither can, it is put back to due. What broke is logged in fixed words.
- **Words.** The core writes them (`alertFor`): the Appointment's name, date and time, the text's kind and when it was due, and why. Nothing else of the Appointment, nor Susan's number, nor the text's words. The email ends with the Appointment's address in the app, added by the messenger from `APP_URL`; a sandbox, with no app address, gets no link. The app notification opens the Appointment, tagged by the text so that one Alert never replaces another.
- **The banner** (`src/components/TextsBanner.tsx`) shows at the top of every screen, at both widths, while `textTrouble` finds that the most recently tried text that has settled, of any kind, did not get through. It links to the Appointment, or to Settings for a test text or a missing number. A later text that is sent or delivered clears it.
- **Backend.** The scheduled run now gets the real Admin messenger, may list the `Admins` group, and may call `ses:SendEmail` on SES identities in its own account and region only. `npm run synth` checks these, and that an Alert is raised by a conditional write. The `Text` model gains `alert`. The app reads it but shows nothing new from it.
- **For the owner to decide:** whether a Reminder not sent only because Susan's number is not set should raise an Alert at all, or only show the banner. It raises one now, worded as a setup problem. Before ticket 18 this means an Alert for every Reminder that comes due while no number is entered.
