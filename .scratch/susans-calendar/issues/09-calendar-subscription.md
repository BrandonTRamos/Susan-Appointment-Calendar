# 09: Calendar subscription

**What to build:** A signed-in person can get a personal link in Settings, paste it into Apple Calendar, Google Calendar or Outlook, and see Susan's Appointments there alongside their own, view-only. They can switch the link off and get a new one if it leaks.

**Spec:** `.scratch/susans-calendar/spec.md`, section "Calendar subscription"; user stories 82 to 86.

**Blocked by:** 04 (Appointments end to end).

**Parallel:** Yes, with 06, 07 and 08. It fills the "Calendar subscription" section of Settings and nothing else there.

**Status:** done

- [x] A public endpoint serves a standard iCalendar feed, addressed by a per-person secret link.
- [x] In the "Calendar subscription" section of Settings, a person can create their link, copy it, switch it off, and replace it with a new one.
- [x] Only a hash of each link is stored, so the link is shown in full only when it is created.
- [x] A link that is unknown or switched off returns nothing about the calendar, and the response does not reveal which of the two it was.
- [x] The feed contains active Appointments with what, who with, where, the Driver and pickup time, and the Note for Susan.
- [x] The feed leaves out Private notes and cancelled Appointments.
- [x] Each Appointment is shown as one hour long, since Appointments have no end time.
- [x] Times appear correctly in a subscriber's calendar whatever time zone the subscriber is in, including across a daylight-saving change.
- [x] Changes in the app reach a subscribed calendar on its next refresh; the feed is never stale by more than the subscriber's own refresh interval.
- [x] Tests check the feed's contents for a sample calendar, the omissions, and a switched-off link.
