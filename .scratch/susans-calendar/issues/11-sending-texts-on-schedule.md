# 11: Sending texts on schedule

**What to build:** Reminders go out when they are due. Every minute the app sends whatever is due, exactly once each, and anyone signed in can see on the Appointment whether each Reminder is waiting, sent or was not sent. The owner can enter Susan's mobile number in Settings and send a test text.

In this ticket the texts go to a stand-in sender that records them instead of sending them, because Textbelt is not connected until ticket 13. Everything else about sending is real.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "Sending and tracking texts", "Reminders" and "Settings and public page"; user stories 45, 46, 60, 69, 94.

**Blocked by:** 07 (Reminders on an Appointment).

**Parallel:** Yes, with 10 and 12.

**Status:** done

- [x] The core depends on a text sender port. A stand-in sender records each text instead of sending it and is used wherever the Textbelt key is absent, including sample-data mode.
- [x] A scheduled run happens every minute, never overlaps itself, and asks the core to send whatever is due.
- [x] Every text is recorded with its kind, the Appointment it concerns, its words, when it was due, and a status of waiting, sent, delivered, failed or not sent.
- [x] Each text has an identity derived from what it is about and when it was due, and is claimed before sending, so that two runs cannot send the same text twice.
- [x] A sending failure that might or might not have gone through is retried a small number of times.
- [x] A Reminder found overdue is still sent as long as the Appointment has not started. Otherwise it is recorded as not sent.
- [x] No Reminder is sent for a cancelled Appointment.
- [x] Deleting an Appointment is refused once any text about it has gone out, using the real record this ticket introduces.
- [x] The "Susan's phone and contact" section of Settings holds Susan's mobile number and the contact name and phone number used later in the automatic answer. With no number set, nothing is sent and the app says so clearly.
- [x] A "Send a test text" button in that section sends a test text through the same path and shows its status.
- [x] The Appointment detail shows every text sent or due for that Appointment, with its status.
- [x] Logs and error messages do not contain Susan's number or the words of her texts.
- [x] Tests through the core cover sending once across overlapping runs, a retry, an overdue Reminder before and after the Appointment's start, and cancellation.

**The owner's decision on overdue Reminders:** a Reminder whose due time had already passed when that time was set is never sent and leaves no record. One whose time was still to come when it was set, and that became overdue while it waited, is caught up as long as the Appointment has not started. After the start it is recorded as not sent, as the spec requires. An unrelated edit to the Appointment does not reset this.

**As built:**

- **When each Reminder's time was set.** Ticket 07 kept no time-of-scheduling field, so each Reminder now carries `setAt`: when its due time was last worked out. That is when it was set, changed or confirmed after review, or when a move of its Appointment re-worked it. The core sets it in the same save as the Reminder (`settled` in `src/lib/calendar/core.ts`). An edit that leaves the due time alone leaves `setAt` alone. `reminderPlan` in `src/lib/calendar/texts.ts` applies the policy, and the scheduled run and the Appointment detail both use it. An Activity update does not count `setAt` as a change to the Reminders (`src/lib/calendar/activityUpdate.ts`).
- **Existing Reminders, handled deliberately.** A Reminder kept before this ticket has no `setAt` (null). It is taken to have been set at its Appointment's last save (`lastChanged ?? added`), the latest moment anyone could have set it. The next save records that moment as its `setAt`, so an unrelated edit afterwards cannot move it on. A Reminder with no `setAt` whose Appointment has already started is let go without a record, because nothing was sending texts when it fell due; this keeps old Reminders from becoming a flood of "not sent" records and, with ticket 15, of Alerts. No data migration is needed.
- **Text records** are the `Text` model, readable by anyone signed in, with live updates. An ID names the Appointment, the Reminder and its due time; a test text is named by the moment it was asked for. Each text is claimed by creating its record, which the data API refuses when the record is already there (`npm run synth` checks the condition in the synthesized resolver). Records hold neither Susan's number nor the Private notes. Statuses have a reason when a text failed or was not sent: `noNumber`, `tooLate`, `cancelled`, `outdated`, `refused` or `gaveUp`.
- **Retries.** A send that might not have gone through stays waiting. A later run tries it again at least two minutes (`RETRY_AFTER`) after the last try, up to three tries (`SEND_ATTEMPTS`); the two minutes outlast any run or command, so a text being sent is never taken for one left behind. A later run also takes up a claim a stopped run left behind. A refused send is failed at once.
- **Retakes are conditional.** A run takes up a waiting text again with `retakeText`, the same store seam as the first claim. It writes through the data API's `updateText` with a condition that the text is still waiting, after the same number of tries and the same last try, so of two overlapping runs only one tries it again. `npm run synth` checks the resolver's condition and that the scheduled run's bundled code uses it. The functions' data API access is unchanged.
- **Retries are checked afresh** (`retrying` in `src/lib/calendar/core.ts`). A Reminder is tried again only while its Appointment is active and has not started, and the same Reminder is still there at the same time with nothing stopping it. It is held while flagged for review. It is given up as failed when its Reminder was removed or retimed (reason `outdated`), or when its Appointment was cancelled or started. A retry carries the Appointment's current details. A text given up after a try is always failed, never not sent, so it still blocks deleting the Appointment.
- **Flagged Reminders are not sent** (story 38). An exact-time Reminder flagged for review since its Appointment moved is not sent while flagged: the plans `awaitingReview` and `heldForReview`. The detail shows it as "Waiting for review". Ticket 07's rules for the move and the confirmation are unchanged.
- **The boundary.** Only a due time strictly before `setAt` was past when it was set. One set for the very moment it is set is due and goes out, and the same holds for a Reminder kept before ticket 11 whose time is its Appointment's last save.
- **No number.** Nothing is sent. Each Reminder that comes due is recorded as not sent with the reason `noNumber`, and setting a number later does not send them all at once. A test text is refused with words saying to enter the number.
- **The scheduled run** is `amplify/functions/send-texts`: an Amplify schedule (`every 1m`, an EventBridge Scheduler cron). It runs at most one at a time (reserved concurrency 1), with a 50-second timeout, and both the schedule and Lambda drop a run that cannot start (no retries, a maximum event age of 60 seconds). `npm run synth` checks each of these.
- **The stand-in sender** is `createStandInSender` in `src/lib/calendar/memory.ts`. `amplify/calendar/text-sender.ts` chooses it for both backend functions until ticket 13 adds Textbelt, and the backend says so to the app (`textSender` in `amplify_outputs.json`, read in `src/config.ts`). Sample data uses it too, with an invented 555-01xx number, and runs what is due every minute while the app is open.
- **Settings** are the `CalendarSettings` model, one row, changed only through the `changeSettings` command. Numbers are US numbers, kept as +1 and ten digits. A change leaves no activity record. The `sendTestText` command sends a test text through the same path.
- **Screens.** The "Susan's phone and contact" section (`src/routes/settings/SusansPhoneAndContact.tsx`) holds the three settings. It warns when no number is set, says when texts are only recorded, and shows the test text's status as it changes. On the Appointment detail, each Reminder shows its status, and "Texts to Susan" (`src/routes/AppointmentTexts.tsx`) lists every text about the Appointment with its status and words. Status words are in `src/lib/textStatus.ts`.
- **Logs and errors.** At the scheduled run and the commands, a failure is logged by `logFailure` (`amplify/calendar/log.ts`) in fixed words: the operation, from a fixed list, and the kind of failure from `failureKind` (`src/lib/failure.ts`). The error's message, stack and cause are never logged. What each function throws is a fresh error in the same fixed words (the run) or `COMMAND_FAILED` (the commands), with no cause. The core's Activity update failure log uses the same kinds. The run otherwise logs only how many texts ended in each status. Tests feed both boundaries an error that repeats a number and a text's words unquoted, and check the log, the thrown message, its stack and its cause.
