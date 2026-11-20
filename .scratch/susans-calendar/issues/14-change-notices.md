# 14: Change notices

**What to build:** When an Appointment that Susan has already been reminded of is moved or cancelled, she gets a text saying so, giving the old time and either the new time or that it is cancelled. She gets one notice for the final outcome however many times the Appointment was edited, none if it was put back as it was, and none about an Appointment she had not yet been told of. Her Reminders follow a moved Appointment to its new time.

**Spec:** `.scratch/susans-calendar/spec.md`, section "Change notices"; user stories 47 to 54.

**Blocked by:** 11 (Sending texts on schedule).

**Parallel:** Yes, with 13, 15 and 16.

**Status:** done

- [x] For each Appointment the core remembers what Susan was last told: the date and time in the most recent text about it.
- [x] A Change notice is due when at least one text about the Appointment has gone out and its current date and time differ from what she was last told, or it has been cancelled.
- [x] No Change notice is sent for an Appointment she has not yet been sent any text about.
- [x] Several edits in a row produce one notice describing the net change. A short settling period after the last edit keeps a notice from going out mid-correction.
- [x] An edit that is put back before the notice goes out produces no notice.
- [x] A Change notice that becomes due between 9:00 pm and 7:00 am waits until 7:00 am, unless the old or the new Appointment time falls before then, in which case it goes at once.
- [x] A Change notice opens "Susan's Calendar:", says "Change:", and gives the old time and either the new time or that the Appointment is cancelled.
- [x] Changes to place, Driver, pickup time or notes produce no Change notice; later Reminders carry the new details.
- [x] A Reminder that was already sent, and whose Appointment then moves so that its time falls in the future again, is due again at the new time.
- [x] Change notices appear in the Appointment's list of texts with their status, like Reminders.
- [x] Tests through the core cover a move and a cancellation before and after a Reminder went out, repeated and reverted edits, and both sides of the 7:00 am rule.

**As built:**

- **What Susan was last told** is kept on each text's own record, as `told` on the `Text` model: the Appointment's date and time the text gave her, and whether it said the Appointment is cancelled (`Told` in `src/lib/calendar/texts.ts`). Every Reminder and Change notice the core records sets it; a Reminder tried again records the details it now carries. Because it lives on the text and not on the Appointment, it stays what she was told however often the Appointment moves afterwards. `lastTold` (`src/lib/calendar/changeNotices.ts`) takes it from the most recent text about the Appointment that may have reached her: the same test that refuses deleting (`mayHaveReachedSusan`), so a text recorded as not sent, or refused outright, does not count. A text recorded before this ticket has no `told` and is passed over: until ticket 13 every text went to the stand-in, so none reached a phone.
- **When one is due** is worked out by `changeNoticeOwed`, used by the scheduled run and by the Appointment detail alike. It is owed once the Appointment differs from what she was last told, by date and time or by being cancelled, and falls due five minutes (`SETTLING_PERIOD`) after the Appointment's last edit of any kind. A cancellation notice names the time she was last told. Overnight is judged in Susan's time zone (`isOvernight`): a notice that would fall due between 9:00 pm and 7:00 am waits until 7:00 am unless the old or new time is still to come before that 7:00 am.
- **Gaps filled.** "Before then" is read as a time still to come after the edit, so an old time already past does not hurry a notice through the night. An edit made once the old and new times have both passed sends nothing and leaves no record, like a Reminder whose time had passed when it was set; a notice the run reaches only after both have passed is recorded as not sent (`tooLate`). Both are written into the spec.
- **Sending** goes through the same path as a Reminder. A notice's ID is `changeNotice:<Appointment>:<due time>`, claimed by creating its record, so overlapping runs send it once. One that might not have gone through is tried again with the same words, only while the Appointment is still as it says and before both times have passed; one a later edit made wrong is given up as failed (`outdated`), and since it may have reached her the next notice is told from it. No number: recorded as not sent, and setting the number later sends none. In a run, notices go before Reminders, so she hears of a change before a Reminder at the new time.
- **Reminders follow a moved Appointment** as ticket 07 built them: a gap or day-before Reminder that already went out is worked out again for the new time, which is a new text, so it is due again there. Nothing in the Reminder policy changed.
- **Words** are `changeNoticeWords` in `src/lib/calendar/reminders.ts`: "Susan's Calendar: Change: Cardiology check-up with Dr. Patel has moved from tomorrow at 2:00 pm to Monday, November 23 at 10:00 am." or "Susan's Calendar: Change: Cardiology check-up with Dr. Patel, tomorrow at 2:00 pm, is cancelled.", with each day in words as seen when it goes out, and kept to the basic text-message characters.
- **Screens.** "Texts to Susan" on the Appointment (`src/routes/AppointmentTexts.tsx`) lists each recorded Change notice with its status and words, like a Reminder, and shows one still to go out at the top, with when it is due, why it is waiting and the words it will have. Status words for a notice's own reasons are in `src/lib/textStatus.ts`.
- **Backend.** The `Text` model gains `told` (custom type `Told`) in `amplify/data/resource.ts`. `npm run synth` checks that the record keeps it, that both the claim and the retake write it, and that the scheduled run's code works out Change notices.
