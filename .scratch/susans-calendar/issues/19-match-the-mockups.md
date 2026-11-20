# 19: Match the mockups

**What to build:** The app looks like the mockups the owner chose: their blue, their spacing, and buttons that line up. The owner found the app as built unprofessional: teal where the mockups are blue, and buttons and rows out of line.

**Spec:** `.scratch/susans-calendar/spec.md`, section "Screens". Design references: every image in `docs/design/`.

**Blocked by:** None.

**Status:** done

**What had gone wrong:**

- `docs/design/README.md`, the spec and ticket 06 all said the mockups "fix layout and content, not colour" and that colours follow the sibling apps. Every ticket was built to that, in the sibling apps' teal. The owner had chosen the mockups' look, colour included.
- No ticket's acceptance criteria asked anyone to look at a finished screen beside its mockup. Screen tests check words and roles, which cannot see a row out of line.
- The Series form's `.weekday` style (a 52px-tall row for a checkbox) also matched the weekday in a list row's date block, and pushed the day of the month down.
- The Settings form had no gap between one field's hint and the next field's label.
- An Appointment's three buttons wrapped unevenly, and the count on the Replies tab sat on top of its label in the sidebar.
- The sidebar and detail panel were wide enough at common desktop widths to break a time over two lines in the month grid and to stack the next-Appointment card.

**As built:**

- [x] The colours are the mockups': a blue accent on near-black in the dark appearance, and a light appearance made to match. Neutral greys replace the green-tinted ones. The app icon, the sign-in screen and the installed app's colours use the same blue.
- [x] Desktop Upcoming: the next-Appointment card has the day and time on the left, a rule, and what it is beside them; later rows have a date block, the time, what it is, and how many Reminders are still to be sent. The picked Appointment has a soft blue fill.
- [x] Phone Upcoming: the later Appointments are a plain list with the date in a line at the start of each row, as the phone mockup has them.
- [x] The sidebar is narrower, shows the Replies count at the end of its row, and names the signed-in person beside their initial.
- [x] The detail panel uses small headings ("Reminders", "What Susan will read", "Private notes") as the mockup does, shows a text's words as a message bubble, and has Edit beside Cancel Appointment at its foot, with Delete Appointment beneath.
- [x] A text's badge is green once it has gone, red when it needs looking into, and amber while it waits.
- [x] The app keeps its own scale: 18px type and controls at least 52px tall. The mockups' type is smaller.
- [x] Every screen was looked at beside its mockup at phone and desktop width, light and dark.
