# 11: Sending texts on schedule

**What to build:** Reminders go out when they are due. Every minute the app sends whatever is due, exactly once each, and anyone signed in can see on the Appointment whether each Reminder is waiting, sent or was not sent. The owner can enter Susan's mobile number in Settings and send a test text.

In this ticket the texts go to a stand-in sender that records them instead of sending them, because Textbelt is not connected until ticket 13. Everything else about sending is real.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "Sending and tracking texts", "Reminders" and "Settings and public page"; user stories 45, 46, 60, 69, 94.

**Blocked by:** 07 (Reminders on an Appointment).

**Parallel:** Yes, with 10 and 12.

**Status:** ready-for-agent

- [ ] The core depends on a text sender port. A stand-in sender records each text instead of sending it and is used wherever the Textbelt key is absent, including sample-data mode.
- [ ] A scheduled run happens every minute, never overlaps itself, and asks the core to send whatever is due.
- [ ] Every text is recorded with its kind, the Appointment it concerns, its words, when it was due, and a status of waiting, sent, delivered, failed or not sent.
- [ ] Each text has an identity derived from what it is about and when it was due, and is claimed before sending, so that two runs cannot send the same text twice.
- [ ] A sending failure that might or might not have gone through is retried a small number of times.
- [ ] A Reminder found overdue is still sent as long as the Appointment has not started. Otherwise it is recorded as not sent.
- [ ] No Reminder is sent for a cancelled Appointment.
- [ ] Deleting an Appointment is refused once any text about it has gone out, using the real record this ticket introduces.
- [ ] The "Susan's phone and contact" section of Settings holds Susan's mobile number and the contact name and phone number used later in the automatic answer. With no number set, nothing is sent and the app says so clearly.
- [ ] A "Send a test text" button in that section sends a test text through the same path and shows its status.
- [ ] The Appointment detail shows every text sent or due for that Appointment, with its status.
- [ ] Logs and error messages do not contain Susan's number or the words of her texts.
- [ ] Tests through the core cover sending once across overlapping runs, a retry, an overdue Reminder before and after the Appointment's start, and cancellation.
