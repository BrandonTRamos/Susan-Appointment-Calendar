# 12: Series

**What to build:** Anyone signed in can enter a repeating commitment once, such as dialysis every Monday and Thursday or a monthly check-up, and have every Appointment in it appear on the calendar with its Reminders. They can later change or cancel just one of them, or one and all the later ones.

**Spec:** `.scratch/susans-calendar/spec.md`, section "Appointments and Series"; user stories 22 to 28 and 72. The repeat-rule library used by Personal Command Center is the prior art for patterns.

**Blocked by:** 07 (Reminders on an Appointment).

**Parallel:** Yes, with 10 and 11.

**Status:** done

- [x] The Appointment form can make an Appointment repeat: weekly on chosen weekdays, every N weeks, or monthly, ending on a date or never.
- [x] The core offers commands to add a Series, change it, and end it.
- [x] Appointments in a Series are real Appointments, created ahead of time up to a rolling horizon. A Series with no end is topped up periodically so the horizon never runs dry.
- [x] Reminders set on a Series are gap-based only and apply to every Appointment in it. An exact-time Reminder can still be added to one Appointment in a Series.
- [x] Changing or cancelling an Appointment that belongs to a Series asks: only this one, or this and all later ones.
- [x] "Only this one" changes that Appointment alone and marks it as individually changed.
- [x] "This and all later ones" ends the Series at that point and continues it as a new Series with the new details. Later Appointments are replaced, including ones individually changed.
- [x] An Appointment that belongs to a Series is recognisable as such in lists and in its detail.
- [x] Adding or changing a Series yields one activity record, not one per Appointment.
- [x] Repeat patterns are worked out in Susan's time zone, so a weekly 9:00 am stays at 9:00 am across a daylight-saving change.
- [x] On the night the clocks go forward, an Appointment a Series makes whose time they skip stays on the calendar, moved on by the zone's actual jump (to the next day where it crosses midnight), says it was moved, and holds for review, never sending, any Reminder the jump puts at or after its start. A start a person enters that the clocks skip is still refused. Other dates keep the Series' time, after a top-up too.
- [x] Tests through the core cover each pattern, both kinds of change, the top-up, and the daylight-saving cases, including a half-hour jump, one across midnight, a held Reminder at the start, and held Reminders never being sent. A screen test covers the "only this one or all later ones" choice.
