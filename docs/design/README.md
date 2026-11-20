# Design references

Mockups of the layouts the owner chose in November 2026. They fix **layout, content and colour**: what is on each screen, where it sits, how large it is relative to its neighbours, and how it is coloured.

The mockups show the dark appearance: a blue accent on near-black, with amber for a Reminder still to go and red for Cancel. The light appearance is made to match, with the same blue on white. The colours are the variables at the top of `src/styles.css`; the app icon (`scripts/make-icons.py`), the sign-in screen (`src/SignInScreen.tsx`) and the installed app's colours (`vite.config.ts`, `index.html`) use the same blue.

Until ticket 19 this page said the mockups did not fix colour and that the app's colours followed the sibling apps, so the app was built in their teal. The owner did not want that: the mockups are the look they chose.

The app's type is a usual size, 16px with controls at least 44px tall. Until November 2026 it was 18px with controls 52px tall, larger than the mockups', for Susan; the owner found that too big for everyone, and Susan is not expected to use the app much. That scale is now Larger text, a choice in Settings for each device.

| File                           | Shows                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `phone-upcoming-and-month.png` | The Upcoming and Month tabs at phone width, with the bottom tab bar.                               |
| `desktop-upcoming.png`         | The Upcoming tab at desktop width: sidebar, list, and the detail panel for the picked Appointment. |
| `desktop-month.png`            | The Month tab at desktop width: sidebar, full month grid, and the same detail panel.               |

Rules the owner set:

- Upcoming and Month are separate tabs at every width. They are never combined on one page.
- The app is built for phone and desktop alike.

The written description of every screen is in the "Screens" section of `.scratch/susans-calendar/spec.md`. If a mockup and the spec disagree, the spec wins; fix whichever is wrong.

Sample data in the mockups (names, places, times) is invented.
