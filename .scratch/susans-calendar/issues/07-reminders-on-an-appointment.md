# 07: Reminders on an Appointment

**What to build:** Anyone signed in can put any number of Reminders on an Appointment, see when each will go out, and read the exact words Susan will receive. A new Appointment starts with one Reminder at 6:00 pm the evening before. The form warns about a Reminder that falls overnight or has already passed, and asks for confirmation before saving an Appointment that will send no Reminder.

Nothing is sent in this ticket. It delivers the planning and the wording; ticket 11 delivers the sending.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "Reminders" and "Wording"; user stories 29 to 44.

**Blocked by:** 04 (Appointments end to end).

**Parallel:** Yes, with 06, 08 and 09. Ticket 06 also touches the Appointment form and the detail, so whichever of the two lands second should expect a small merge there.

**Status:** ready-for-agent

- [ ] An Appointment can carry any number of Reminders, added, changed and removed in its form.
- [ ] A Reminder has one of three shapes: a gap before the Appointment's start (minutes, hours or days), a number of days before at a fixed clock time, or an exact date and time.
- [ ] A new Appointment starts with one Reminder, the day before at 6:00 pm, which can be changed or removed like any other.
- [ ] The core works out when each Reminder is due in Susan's time zone, and works it out again when the Appointment's time changes. Gaps are measured from the Appointment's start, not the pickup time.
- [ ] An exact-time Reminder keeps its time when its Appointment moves and is flagged for review until someone confirms or changes it.
- [ ] The form warns when a Reminder falls between 9:00 pm and 7:00 am, and says so when a Reminder's time has already passed.
- [ ] Saving an Appointment with no Reminder still to be sent asks for confirmation first.
- [ ] The core composes each Reminder's words as the spec describes: the opening "Susan's Calendar:", what it is, who with, the day in words and the time, where, the Driver and pickup time when present, then the Note for Susan. Private notes never appear.
- [ ] The day in words is right for the moment the Reminder goes out ("today", "tomorrow", or the weekday and date).
- [ ] Words are kept to the basic SMS character set where possible, for example straight quotes for curly ones.
- [ ] The form and the detail show each Reminder's due time and a preview of its exact words.
- [ ] The next-Appointment card on Upcoming shows the Reminders still to be sent, if ticket 06 has landed.
- [ ] Tests through the core cover each shape, a daylight-saving change, a moved Appointment, and the wording with and without each optional detail. Screen tests cover the three form warnings.
