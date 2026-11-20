# 04: Appointments end to end

**What to build:** Anyone signed in can add an Appointment, see it in a list of upcoming Appointments, open it, change it, cancel it, and delete one entered by mistake. A second person looking at the app sees the change appear without reloading. Each Appointment shows who added it and who last changed it.

This is the first slice of the calendar core, the single module that holds every rule and is the only thing allowed to write calendar data. Later tickets add Reminders, texts and Alerts to the same core, so its shape matters more than the screens here: the form and list in this ticket are deliberately plain, and ticket 06 gives them the chosen design.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "One calendar core", "Time", "Appointments and Series" and "Testing Decisions"; user stories 9 to 18, 20, 21, 79.

**Blocked by:** 01 (Deployable app shell).

**Parallel:** Yes. Independent of 02 and 03.

**Status:** done

- [x] The calendar core exists as one module that depends on a store and a clock through narrow ports, with in-memory stand-ins for tests. It contains no provider-specific code.
- [x] The core offers commands to add, change, cancel and delete an Appointment. Every command carries the acting person and whether they acted through an agent.
- [x] An Appointment holds what it is and a date and start time (both required), who it is with, where (name and address), a Driver name and pickup time, a Note for Susan, and Private notes. It has no end time, category or attachment.
- [x] The core stamps who added an Appointment and who last changed it, and when.
- [x] Cancelling keeps the Appointment, marked cancelled. Deleting removes it, and is refused once any text about it has gone to Susan. No texts exist yet, so the rule is proven in tests with a stand-in.
- [x] Every command that changes the calendar yields exactly one activity record saying who did what to which Appointment and whether it was via an agent. A refused command, and one that changes nothing, yields none. Nothing delivers these yet; ticket 08 does.
- [x] Every date and time means Susan's local time, taken from configuration. Tests run with the machine's time zone set to something other than US Eastern, and cover a daylight-saving change.
- [x] The app reads data directly with live updates, but can only write by calling the core's commands, exposed as custom operations on the data API. A signed-in client cannot write calendar data any other way.
- [x] Any signed-in person can read and change everything; there is no difference between Susan and an Admin.
- [x] A plain form adds and changes an Appointment, a plain list shows upcoming ones in date order, and opening one shows all its details, who added it and who last changed it, with Cancel and Delete.
- [x] A change made by one signed-in person appears for another without a reload.
- [x] The same screens work in sample-data mode.
- [x] Behaviour is tested through the core's commands, not its internals, plus a screen test for adding an Appointment.

## Comments

Built on the branch `ticket/04-appointments-end-to-end`. What the build settled that the ticket and spec left open, all now written into the spec:

- **A cancelled Appointment cannot be changed or cancelled again.** It can still be deleted while no text about it has gone to Susan. If it is happening after all, a new one is added.
- **A change that changes nothing does nothing.** Saving the form as it was, or an agent sending the details an Appointment already has, leaves no "last changed" stamp and no activity record. The activity-record criterion above was reworded to say so.
- **An add carries the new Appointment's ID.** A phone that loses the answer sends the command again; the core then adds one Appointment, not two.
- **A start time the clocks skip is refused** (2:30 am on the night they go forward). One that happens twice, on the night they go back, means the first.
- **The core writes through the data API in the backend**, which is what makes a change appear for everyone without a reload. ADR 0003 records why and what it costs.
- **"Upcoming" means dated today or later, for Susan.** An Appointment from earlier today stays in the list. Cancelled ones are listed, marked cancelled, because no other screen shows them until ticket 10; ticket 06 takes them out of Upcoming.
- **The delete rule has nothing to refuse yet.** The backend's store answers "no text has gone" for every Appointment, since nothing sends texts. Ticket 11 replaces that answer with the real record, as its own checklist says.

Not checked by hand: two people signed in to a deployed backend at the same time. That needs AWS credentials. The path is covered by tests against stand-ins for the data API and by the synth checks, and is the first thing to try after the first deploy.
