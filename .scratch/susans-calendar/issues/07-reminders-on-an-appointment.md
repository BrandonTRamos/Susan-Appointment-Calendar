# 07: Reminders on an Appointment

**What to build:** Anyone signed in can put any number of Reminders on an Appointment, see when each will go out, and read the exact words Susan will receive. A new Appointment starts with one Reminder at 6:00 pm the evening before. The form warns about a Reminder that falls overnight or has already passed, and asks for confirmation before saving an Appointment that will send no Reminder.

Nothing is sent in this ticket. It delivers the planning and the wording; ticket 11 delivers the sending.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "Reminders" and "Wording"; user stories 29 to 44.

**Blocked by:** 04 (Appointments end to end).

**Parallel:** Yes, with 06, 08 and 09. Ticket 06 also touches the Appointment form and the detail, so whichever of the two lands second should expect a small merge there.

**Status:** done

- [x] An Appointment can carry any number of Reminders, added, changed and removed in its form.
- [x] A Reminder has one of three shapes: a gap before the Appointment's start (minutes, hours or days), a number of days before at a fixed clock time, or an exact date and time.
- [x] A new Appointment starts with one Reminder, the day before at 6:00 pm, which can be changed or removed like any other.
- [x] The core works out when each Reminder is due in Susan's time zone, and works it out again when the Appointment's time changes. Gaps are measured from the Appointment's start, not the pickup time.
- [x] An exact-time Reminder keeps its time when its Appointment moves and is flagged for review until someone confirms or changes it.
- [x] The form warns when a Reminder falls between 9:00 pm and 7:00 am, and says so when a Reminder's time has already passed.
- [x] Saving an Appointment with no Reminder still to be sent asks for confirmation first.
- [x] The core composes each Reminder's words as the spec describes: the opening "Susan's Calendar:", what it is, who with, the day in words and the time, where, the Driver and pickup time when present, then the Note for Susan. Private notes never appear.
- [x] The day in words is right for the moment the Reminder goes out ("today", "tomorrow", or the weekday and date).
- [x] Words are kept to the basic SMS character set where possible, for example straight quotes for curly ones.
- [x] The form and the detail show each Reminder's due time and a preview of its exact words.
- [x] The next-Appointment card on Upcoming shows the Reminders still to be sent, if ticket 06 has landed. (06 landed first; 07 fills its `RemindersToSend` place, `src/components/RemindersToSend.tsx`, with `remindersStillToSend` from the calendar core: when each goes out, or "No Reminder to be sent". Screen tests check it at phone and desktop widths.)
- [x] Tests through the core cover each shape, a daylight-saving change, a moved Appointment, and the wording with and without each optional detail. Screen tests cover the three form warnings.

**As built:** Reminders are set as part of adding or changing an Appointment, not by a separate command, so that one save is one change with one activity record. The form and the detail show Reminders through `src/routes/AppointmentReminders.tsx`. A Reminder may not go out after the Appointment starts; the core refuses one, except an exact-time Reminder kept from a move, which stays flagged until someone sees to it. A Reminder at a clock time the clocks skip goes out an hour later, when they have landed; an exact time the clocks skip is refused.
