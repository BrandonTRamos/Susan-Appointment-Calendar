# 14: Change notices

**What to build:** When an Appointment that Susan has already been reminded of is moved or cancelled, she gets a text saying so, giving the old time and either the new time or that it is cancelled. She gets one notice for the final outcome however many times the Appointment was edited, none if it was put back as it was, and none about an Appointment she had not yet been told of. Her Reminders follow a moved Appointment to its new time.

**Spec:** `.scratch/susans-calendar/spec.md`, section "Change notices"; user stories 47 to 54.

**Blocked by:** 11 (Sending texts on schedule).

**Parallel:** Yes, with 13, 15 and 16.

**Status:** ready-for-agent

- [ ] For each Appointment the core remembers what Susan was last told: the date and time in the most recent text about it.
- [ ] A Change notice is due when at least one text about the Appointment has gone out and its current date and time differ from what she was last told, or it has been cancelled.
- [ ] No Change notice is sent for an Appointment she has not yet been sent any text about.
- [ ] Several edits in a row produce one notice describing the net change. A short settling period after the last edit keeps a notice from going out mid-correction.
- [ ] An edit that is put back before the notice goes out produces no notice.
- [ ] A Change notice that becomes due between 9:00 pm and 7:00 am waits until 7:00 am, unless the old or the new Appointment time falls before then, in which case it goes at once.
- [ ] A Change notice opens "Susan's Calendar:", says "Change:", and gives the old time and either the new time or that the Appointment is cancelled.
- [ ] Changes to place, Driver, pickup time or notes produce no Change notice; later Reminders carry the new details.
- [ ] A Reminder that was already sent, and whose Appointment then moves so that its time falls in the future again, is due again at the new time.
- [ ] Change notices appear in the Appointment's list of texts with their status, like Reminders.
- [ ] Tests through the core cover a move and a cancellation before and after a Reminder went out, repeated and reverted edits, and both sides of the 7:00 am rule.
