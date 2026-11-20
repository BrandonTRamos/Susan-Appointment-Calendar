# 08: App notifications and Activity updates

**What to build:** An Admin can turn on notifications from the app on their phone or laptop, and from then on gets an Activity update whenever someone else adds, changes or cancels an Appointment, naming who did it. Tapping it opens that Appointment.

This ticket also establishes the Admin messenger, the port through which the core tells Admins anything. Ticket 15 adds email to it and uses it for Alerts.

**Spec:** `.scratch/susans-calendar/spec.md`, section "Alerts and Activity updates"; user stories 70 to 73. Wellbeing's handling of web push keys and devices is the prior art.

**Blocked by:** 04 (Appointments end to end).

**Parallel:** Yes, with 06, 07 and 09. It fills the "App notifications" section of Settings and nothing else there.

**Status:** done

- [x] The core depends on an Admin messenger port with an app-notification channel, and an in-memory stand-in for tests.
- [x] App notifications use web push with the Wellbeing approach to key management, which needs no secret to be set up.
- [x] In the "App notifications" section of Settings, a person can turn notifications on and off for the device in hand. On an iPhone the section explains that the app must first be added to the home screen.
- [x] Each person's devices are stored against their account. A device that reports its subscription gone is forgotten. Signing out removes that device.
- [x] When an Appointment is added, changed or cancelled, the other Admins get one Activity update naming who did it and what changed.
- [x] The person who made the change gets none. When the change was made through an agent, the Admin who owns that agent's key gets none.
- [x] Susan never gets Activity updates.
- [x] One command produces one Activity update, however many records it touches.
- [x] Tapping an Activity update opens the Appointment it is about.
- [x] Tests through the core check who is and is not told for each kind of change.

## As built

- The Admin messenger port is `AdminMessenger` in `src/lib/calendar/ports.ts`: `admins()` (from the `Admins` group) and `sendAppNotification()`. The in-memory stand-in is `createMemoryMessenger` in `memory.ts`. The core picks who is told and writes the words (`activityUpdate.ts`).
- The key pair is made by the backend (`amplify/functions/app-notifications`) on first use and kept in the data API, closed to everyone signed in. Wellbeing makes it in the browser, which suits one owner but would hand the private half to every account here. No secret is set up either way.
- Deleting an Appointment sends no Activity update: the spec names adding, changing and cancelling only.
- An Activity update that cannot be sent does not undo or fail the command; what broke is logged without the Appointment.
- Turning a device off forgets it only for the signed-in person. The delete is one conditional write in DynamoDB, made on condition that the device is still theirs when it lands, so a device another account took over, even between an earlier read and the delete, stays with them. The answer says whether it was forgotten, was not kept, or is someone else's; in the last case turning off and signing out both leave the browser's subscription alone. When the backend cannot be reached at sign-out, the subscription is ended anyway and the sign-out goes ahead.
- The app-notifications function's data API access is narrowed to the device and key operations it uses, and a gone device is forgotten only if it is still the same subscription for the same person.
- Tapping an app notification moves an open window of the app to the Appointment, whatever screen it shows (a Public page or the sign-in screen too), or opens a new one.
- If the device cannot be kept when notifications are turned on, the browser's new subscription is undone, so Settings never shows the device as on.
