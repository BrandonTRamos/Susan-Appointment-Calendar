# 04: Appointments end to end

**What to build:** Anyone signed in can add an Appointment, see it in a list of upcoming Appointments, open it, change it, cancel it, and delete one entered by mistake. A second person looking at the app sees the change appear without reloading. Each Appointment shows who added it and who last changed it.

This is the first slice of the calendar core, the single module that holds every rule and is the only thing allowed to write calendar data. Later tickets add Reminders, texts and Alerts to the same core, so its shape matters more than the screens here: the form and list in this ticket are deliberately plain, and ticket 06 gives them the chosen design.

**Spec:** `.scratch/susans-calendar/spec.md`, sections "One calendar core", "Time", "Appointments and Series" and "Testing Decisions"; user stories 9 to 18, 20, 21, 79.

**Blocked by:** 01 (Deployable app shell).

**Parallel:** Yes. Independent of 02 and 03.

**Status:** ready-for-agent

- [ ] The calendar core exists as one module that depends on a store and a clock through narrow ports, with in-memory stand-ins for tests. It contains no provider-specific code.
- [ ] The core offers commands to add, change, cancel and delete an Appointment. Every command carries the acting person and whether they acted through an agent.
- [ ] An Appointment holds what it is and a date and start time (both required), who it is with, where (name and address), a Driver name and pickup time, a Note for Susan, and Private notes. It has no end time, category or attachment.
- [ ] The core stamps who added an Appointment and who last changed it, and when.
- [ ] Cancelling keeps the Appointment, marked cancelled. Deleting removes it, and is refused once any text about it has gone to Susan. No texts exist yet, so the rule is proven in tests with a stand-in.
- [ ] Every command yields exactly one activity record saying who did what to which Appointment and whether it was via an agent. Nothing delivers these yet; ticket 08 does.
- [ ] Every date and time means Susan's local time, taken from configuration. Tests run with the machine's time zone set to something other than US Eastern, and cover a daylight-saving change.
- [ ] The app reads data directly with live updates, but can only write by calling the core's commands, exposed as custom operations on the data API. A signed-in client cannot write calendar data any other way.
- [ ] Any signed-in person can read and change everything; there is no difference between Susan and an Admin.
- [ ] A plain form adds and changes an Appointment, a plain list shows upcoming ones in date order, and opening one shows all its details, who added it and who last changed it, with Cancel and Delete.
- [ ] A change made by one signed-in person appears for another without a reload.
- [ ] The same screens work in sample-data mode.
- [ ] Behaviour is tested through the core's commands, not its internals, plus a screen test for adding an Appointment.
