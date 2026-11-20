# 10: Month and Past tabs

**What to build:** Anyone signed in can see a month at a glance, find a free day or jump to a date, and look back at Appointments that have already happened. Month is its own tab at every width; it is never combined with Upcoming.

**Spec:** `.scratch/susans-calendar/spec.md`, section "Screens"; user stories 75 and 77. Design references: `docs/design/phone-upcoming-and-month.png` and `docs/design/desktop-month.png`.

**Blocked by:** 06 (Upcoming tab and detail panel). It reuses that ticket's detail panel, rows and full-screen detail.

**Parallel:** Yes, with 11 and 12.

**Status:** done

- [x] At phone width, the Month tab shows a month grid with a mark on each day that has an Appointment. Picking a day lists that day's Appointments beneath the grid, followed by the ones after it.
- [x] At desktop width, the month grid fills the middle column and each Appointment appears in its day's cell by time and name. Picking one opens it in the detail panel on the right.
- [x] Today is marked. Previous, next and "Today" controls move between months.
- [x] Days belonging to the neighbouring months are shown but visibly quieter.
- [x] A day with more Appointments than fit in its cell says how many more there are.
- [x] A Past screen lists Appointments that have already happened, newest first, including cancelled ones marked as cancelled.
- [x] Past is a sidebar tab at desktop width. At phone width, where the tab bar has no room for it, it is reached from a link at the end of the Upcoming list.
- [x] Opening a past Appointment shows its full detail.
- [x] Screen tests cover picking a day, moving between months, and the Past list's order.

**As built:**

- Month shows cancelled Appointments, marked as cancelled: on a phone a hollow mark on a day whose every Appointment was cancelled, and a struck-through row with a "Cancelled" badge in the list beneath the grid; on a desktop a dashed, struck-through entry labelled "Cancelled" in its cell. Upcoming still leaves cancelled ones out.
- Moving to another month picks today if it is in that month, otherwise the month's first day. Picking a day of a neighbouring month moves the grid to that month. The month on show and the picked day are kept while an Appointment opened from Month is open.
- On a desktop a cell shows two Appointments; a "2 more" button opens the cell out to show every one.
- An Appointment opens beside, and on a phone goes back to, the tab it was opened from (`usePickedFrom` in `src/components/Navigation.tsx`).
- Past is every Appointment dated before today (`pastAppointments` in the calendar core); one from earlier today is still on Upcoming.
