# 06: Upcoming tab and detail panel

**What to build:** The Upcoming tab and the Appointment detail look and behave as the owner chose, at phone and desktop widths. On a phone, Upcoming leads with one large card for the next Appointment and lists the later ones beneath it; opening one fills the screen. On a desktop, the list sits in the middle column and the picked Appointment is open in a panel on the right, with the next Appointment picked to begin with. The app also warns when a new or changed Appointment overlaps another.

Ticket 04 left a plain form and list. This ticket replaces their layout, not their behaviour.

**Spec:** `.scratch/susans-calendar/spec.md`, section "Screens"; user stories 19, 74, 76, 78, 81. Design references: `docs/design/phone-upcoming-and-month.png` and `docs/design/desktop-upcoming.png`. The mockups fix layout and content, not colour.

**Blocked by:** 04 (Appointments end to end).

**Parallel:** Yes, with 07, 08 and 09. Ticket 07 also touches the Appointment form and the detail (it adds the Reminders section), so whichever of the two lands second should expect a small merge there.

**Status:** done

- [x] At phone width, Upcoming leads with a card for the next Appointment showing the day in words ("Today", "Tomorrow", or the weekday and date), the time in large type, what it is, who with and where, and the Driver and pickup time when present.
- [x] The card has a place for the Reminders still to be sent. If ticket 07 has landed it is filled; if not, the place is left for 07 to fill.
- [x] Later Appointments follow as rows, each starting with its date.
- [x] At phone width, opening an Appointment shows its detail as a full screen, and the Appointment form is a full screen.
- [x] At desktop width, the detail of the picked Appointment is shown in the right-hand panel, with Edit and Cancel, and who added and last changed it. On arrival the next Appointment is picked. The Appointment form opens in the same panel.
- [x] With nothing upcoming, the tab says so plainly and offers to add an Appointment.
- [x] Cancelled Appointments are not shown in Upcoming.
- [x] Saving an Appointment that overlaps another (treating each as about an hour long) shows a warning naming the other one. The warning does not block saving.
- [x] Type is large and controls are plain, in light and dark appearance, and nothing is cramped or stretched at either width.
- [x] Screen tests cover the next-Appointment card, the empty state and the overlap warning.

**As built:**

- The place for the Reminders still to be sent is `RemindersToSend` (`src/components/RemindersToSend.tsx`), rendered inside the next-Appointment card. It shows nothing until ticket 07 fills it.
- The overlap rule is `overlappingAppointments` in the calendar core: two active Appointments overlap when they start less than an hour apart, measured in real time. The warning is on the Appointment's detail, so it is the first thing seen after saving, and it stays while the overlap does.
- At desktop width an Appointment's addresses (`/appointments/<id>`, `/edit`, `/new`) fill the detail panel, and the middle column keeps the tab the Appointment was opened from (ticket 10): Upcoming, Month or Past, or Upcoming when the address is opened directly. On a phone the Appointment's way back leads to that same tab.
