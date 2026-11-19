# 10: Month and Past tabs

**What to build:** Anyone signed in can see a month at a glance, find a free day or jump to a date, and look back at Appointments that have already happened. Month is its own tab at every width; it is never combined with Upcoming.

**Spec:** `.scratch/susans-calendar/spec.md`, section "Screens"; user stories 75 and 77. Design references: `docs/design/phone-upcoming-and-month.png` and `docs/design/desktop-month.png`.

**Blocked by:** 06 (Upcoming tab and detail panel). It reuses that ticket's detail panel, rows and full-screen detail.

**Parallel:** Yes, with 11 and 12.

**Status:** ready-for-agent

- [ ] At phone width, the Month tab shows a month grid with a mark on each day that has an Appointment. Picking a day lists that day's Appointments beneath the grid, followed by the ones after it.
- [ ] At desktop width, the month grid fills the middle column and each Appointment appears in its day's cell by time and name. Picking one opens it in the detail panel on the right.
- [ ] Today is marked. Previous, next and "Today" controls move between months.
- [ ] Days belonging to the neighbouring months are shown but visibly quieter.
- [ ] A day with more Appointments than fit in its cell says how many more there are.
- [ ] A Past screen lists Appointments that have already happened, newest first, including cancelled ones marked as cancelled.
- [ ] Past is a sidebar tab at desktop width. At phone width, where the tab bar has no room for it, it is reached from a link at the end of the Upcoming list.
- [ ] Opening a past Appointment shows its full detail.
- [ ] Screen tests cover picking a day, moving between months, and the Past list's order.
