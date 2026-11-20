# Susan Appointment Calendar

Keeps track of Susan's medical and other appointments and reminds her of them, because she is forgetful and other people manage her calendar for her.

## Language

**Susan**:
The one person whose appointments this calendar holds and who is reminded of them. There is no second calendar and no other person in her position.
_Avoid_: Patient, care recipient, grandmother, user

**Admin**:
A person other than Susan who manages her calendar. An Admin can do everything Susan can do and nothing more.
_Avoid_: Caregiver, family member, user, manager

**Appointment**:
Something Susan has to be at, at a set date and time, whether medical or not. Everything on the calendar is an Appointment; there are no other kinds of entry.
_Avoid_: Event, visit, booking, entry

**Series**:
Appointments that repeat on a regular pattern and were entered once. Each one in a Series is still an Appointment in its own right and can be changed or cancelled without affecting the others.
_Avoid_: Recurring event, recurrence, repeat

**Reminder**:
A text message to Susan about one appointment. An appointment has any number of Reminders, each set individually on that appointment.
_Avoid_: Notification, alert, nudge

**Change notice**:
A text message to Susan saying that an Appointment she has already been reminded of has moved or been cancelled. It is not a Reminder and is never sent for an Appointment she has not yet been reminded of.
_Avoid_: Update, cancellation text, correction

**Confirmation text**:
The first text message Susan gets, sent once, saying that she agreed to be texted and how to stop the texts. It is the only one that carries opt-out wording. It is not a Reminder.
_Avoid_: Welcome message, opt-in message, first Reminder

**Reply**:
A text message Susan sends back to the number her Reminders come from. A Reply is passed on to every Admin for a person to read; the calendar never acts on what it says.
_Avoid_: Response, confirmation, inbound message

**Alert**:
A warning to every Admin that a Reminder or Change notice did not reach Susan. Alerts go to Admins only, never to Susan.
_Avoid_: Notification, failure notice, warning

**Activity update**:
Word to the other Admins that someone has added, changed or cancelled an Appointment, naming who did it. Unlike an Alert, it reports normal use and not a problem.
_Avoid_: Notification, change notice, audit alert

**Activity record**:
The calendar's own note that someone added, changed, cancelled or deleted an Appointment: who did it, what they did, to which Appointment, and whether through their agent. Each such act leaves exactly one. An Activity update is the message that tells the other Admins about one.
_Avoid_: Audit log, history entry, event

**Public pages**:
The pages anyone can open without signing in: what the calendar is, its privacy policy and its terms. They exist so that Susan, and anyone who asks, can read what the calendar texts and what it does with her number.
_Avoid_: Landing page, marketing site, legal pages

**Driver**:
The person taking Susan to an appointment, recorded on that appointment by name. A Driver is usually not an Admin and is never contacted by the calendar.
_Avoid_: Escort, ride, transport contact

**Note for Susan**:
Extra words on an Appointment that are included in every Reminder for it.
_Avoid_: Message, instructions, comment

**Private notes**:
Words on an Appointment that Admins and Susan can read in the calendar but that are never sent in a Reminder.
_Avoid_: Admin notes, internal notes, comments
