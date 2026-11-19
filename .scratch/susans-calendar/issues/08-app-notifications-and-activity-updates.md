# 08: App notifications and Activity updates

**What to build:** An Admin can turn on notifications from the app on their phone or laptop, and from then on gets an Activity update whenever someone else adds, changes or cancels an Appointment, naming who did it. Tapping it opens that Appointment.

This ticket also establishes the Admin messenger, the port through which the core tells Admins anything. Ticket 15 adds email to it and uses it for Alerts.

**Spec:** `.scratch/susans-calendar/spec.md`, section "Alerts and Activity updates"; user stories 70 to 73. Wellbeing's handling of web push keys and devices is the prior art.

**Blocked by:** 04 (Appointments end to end).

**Parallel:** Yes, with 06, 07 and 09. It fills the "App notifications" section of Settings and nothing else there.

**Status:** ready-for-agent

- [ ] The core depends on an Admin messenger port with an app-notification channel, and an in-memory stand-in for tests.
- [ ] App notifications use web push with the Wellbeing approach to key management, which needs no secret to be set up.
- [ ] In the "App notifications" section of Settings, a person can turn notifications on and off for the device in hand. On an iPhone the section explains that the app must first be added to the home screen.
- [ ] Each person's devices are stored against their account. A device that reports its subscription gone is forgotten. Signing out removes that device.
- [ ] When an Appointment is added, changed or cancelled, the other Admins get one Activity update naming who did it and what changed.
- [ ] The person who made the change gets none. When the change was made through an agent, the Admin who owns that agent's key gets none.
- [ ] Susan never gets Activity updates.
- [ ] One command produces one Activity update, however many records it touches.
- [ ] Tapping an Activity update opens the Appointment it is about.
- [ ] Tests through the core check who is and is not told for each kind of change.
