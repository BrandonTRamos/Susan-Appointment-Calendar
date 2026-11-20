# Spec: Susan's Calendar

**Status:** ready-for-agent

This spec uses the vocabulary in `CONTEXT.md` (Susan, Admin, Appointment, Series, Reminder, Change notice, Confirmation text, Reply, Alert, Activity update, Public pages, Driver, Note for Susan, Private notes) and respects ADR 0002 (text messages are sent through Textbelt), which supersedes ADR 0001. The repo is empty apart from agent docs, so everything below is new.

## Problem Statement

Susan is elderly and very forgetful. She has medical and other appointments to keep, booked by different people at different times, and she misses them or is unprepared for them because nothing reliably tells her, close to the moment, where she needs to be and who is taking her.

The people who help her have no shared place to keep her appointments. Details live in individual phones, on paper and in memory, so nobody can be sure the others know about a new appointment, a moved one or a cancelled one, and nobody finds out that Susan was not reminded until she has already missed something.

## Solution

Susan's Calendar is a small private web app holding one calendar: Susan's. Susan and a handful of Admins can each sign in and add, change or cancel any Appointment, with identical rights.

The calendar texts Susan. Every Appointment carries any number of Reminders, each sent to her iPhone as an ordinary text message at a time chosen on that Appointment. If an Appointment she has already been reminded of moves or is cancelled, she gets a Change notice. Every text is written by the app in the same recognizable form and opens with "Susan's Calendar:".

Admins are kept in the loop. They get an Alert, by email and app notification, when a text to Susan does not get through; her Replies are passed on to them; and they get an Activity update when someone else changes the calendar. They can also see her Appointments in their own calendar app through a view-only subscription, and connect their AI agents to the calendar through an MCP server.

## User Stories

### Signing in and people

1. As the owner, I want to create every account by hand, so that a calendar of someone's medical appointments is closed to strangers.
2. As an Admin, I want to sign in with my email and password, so that I can reach the calendar from my phone or laptop.
3. As Susan, I want to sign in with only an email and password, so that I am not asked for a code I cannot manage.
4. As Susan, I want to stay signed in on my iPhone and laptop for a long time, so that I rarely see a sign-in screen.
5. As anyone signed in, I want to sign out, so that a shared or borrowed device does not stay open to the calendar.
6. As a stranger, I want no way to create an account for myself, so that the owner's control over who gets in cannot be bypassed.
7. As an Admin, I want everyone signed in to have the same rights, so that whoever hears about a change first can enter it.
8. As anyone signed in, I want my name attached to my account, so that the calendar can say who changed what.

### Appointments

9. As anyone signed in, I want to add an Appointment with just what it is and its date and start time, so that I can capture one quickly while on the phone with an office.
10. As anyone signed in, I want to record who the Appointment is with, so that Susan and the Admins know which doctor or person it involves.
11. As anyone signed in, I want to record where the Appointment is, by name and address, so that whoever takes her knows where to go.
12. As anyone signed in, I want to record a Driver by name and a pickup time, so that everyone knows who is taking her and when, even when the Driver has no account.
13. As anyone signed in, I want to write a Note for Susan on an Appointment, so that instructions like "don't eat after midnight" reach her in every Reminder.
14. As an Admin, I want to write Private notes on an Appointment, so that I can keep insurance details or questions for the doctor without them ever being texted.
15. As anyone signed in, I want to change any detail of an Appointment, so that the calendar matches what the office last said.
16. As anyone signed in, I want to cancel an Appointment, so that Susan stops being reminded of something that is not happening.
17. As anyone signed in, I want a cancelled Appointment to stay visible in the history, marked cancelled, so that nobody wonders where it went.
18. As anyone signed in, I want to delete an Appointment that was entered by mistake, as long as Susan was never reminded of it, so that mistakes do not clutter the calendar.
19. As anyone signed in, I want a warning when a new Appointment overlaps another, so that double bookings are caught when they are made.
20. As anyone signed in, I want every time I enter to mean Susan's local time, so that an Admin travelling in another time zone cannot shift her Appointments.
21. As anyone signed in, I want each Appointment to show who added it and who last changed it, and when, so that conflicting information can be settled.

### Repeating Appointments

22. As anyone signed in, I want to enter a Series that repeats weekly on chosen days, so that a standing commitment such as dialysis is entered once.
23. As anyone signed in, I want to enter a Series that repeats every few weeks or monthly, so that standing check-ups are covered.
24. As anyone signed in, I want a Series to end on a date or run with no end, so that it matches the real arrangement.
25. As anyone signed in, I want to change or cancel only one Appointment in a Series, so that a holiday week does not disturb the rest.
26. As anyone signed in, I want to change or cancel one Appointment and all later ones in a Series, so that a permanent change of day or time is entered once.
27. As anyone signed in, I want the Reminders I set on a Series to apply to every Appointment in it, so that I do not set them again each week.
28. As anyone signed in, I want to tell at a glance that an Appointment belongs to a Series, so that I know which kind of change I am making.

### Reminders

29. As anyone signed in, I want to put any number of Reminders on an Appointment, so that important or early Appointments can get more of them.
30. As anyone signed in, I want to set a Reminder as a gap before the Appointment, such as two hours or one day, so that it stays correct if the Appointment moves.
31. As anyone signed in, I want to set a Reminder at an exact date and time, so that I can pick a moment I know she will be home.
32. As anyone signed in, I want a new Appointment to start with one Reminder at 6:00 pm the evening before, so that an Appointment entered in a hurry is still reminded.
33. As anyone signed in, I want to remove or change the starting Reminder, so that the default never forces a text I do not want.
34. As anyone signed in, I want to be asked to confirm before saving an Appointment that will send no Reminder, so that I do not leave Susan unreminded by accident.
35. As anyone signed in, I want to be told when a Reminder's time has already passed as I set it, so that I do not rely on a text that will never be sent.
36. As anyone signed in, I want a warning when a Reminder falls between 9:00 pm and 7:00 am, so that an overnight text is a choice and not an accident.
37. As anyone signed in, I want an overnight Reminder I have confirmed to be sent exactly when set, so that an early Appointment still gets its text.
38. As anyone signed in, I want exact-time Reminders flagged for review when their Appointment moves, so that a Reminder does not go out at a time that no longer makes sense.
39. As anyone signed in, I want to see the exact words of each Reminder before it is sent, so that I know what Susan will read.
40. As Susan, I want every Reminder to open with "Susan's Calendar:", so that I recognize it and trust it.
41. As Susan, I want each Reminder to tell me what the Appointment is, who it is with, the day and time, and where, so that one text is enough.
42. As Susan, I want each Reminder to say "today", "tomorrow" or the weekday, so that I do not have to work out the date.
43. As Susan, I want each Reminder to name my Driver and pickup time when there is one, so that I know who is coming and when to be ready.
44. As Susan, I want the Note for Susan included in each Reminder, so that I see instructions each time I am reminded.
45. As Susan, I want each Reminder to arrive once, so that repeated copies do not confuse me.
46. As Susan, I want no Reminders for a cancelled Appointment, so that I do not get ready for nothing.

### Change notices

47. As Susan, I want a text when an Appointment I have already been reminded of is moved, giving the old and the new time, so that I do not turn up at the wrong time.
48. As Susan, I want a text when an Appointment I have already been reminded of is cancelled, so that I do not get ready for it.
49. As Susan, I want no text about a change to an Appointment I have not yet been reminded of, so that I am not confused by news about something I did not know.
50. As Susan, I want a single Change notice describing the final outcome when someone corrects an Appointment several times in a row, so that I am not sent a string of contradicting texts.
51. As Susan, I want no Change notice when an Appointment is changed and then put back as it was, so that I am not told about a change that did not happen.
52. As Susan, I want a Change notice that comes up overnight to wait until 7:00 am, so that I am not woken by someone's late-night edit.
53. As Susan, I want an overnight Change notice sent straight away when the Appointment is before 7:00 am, so that I am not told too late.
54. As Susan, I want Reminders for a moved Appointment to follow it to the new time, so that I am reminded again at the right moments.

### Replies

55. As Susan, I want an automatic answer when I reply to a text, telling me nobody reads replies there and who to call, so that I do not wait for a response.
56. As an Admin, I want anything Susan texts back passed on to me by email and app notification, so that "I can't go, I'm not well" reaches a person.
57. As an Admin, I want Susan's Replies listed in the app with their time, so that I can see what she wrote if I missed the message.
58. As an Admin, I want the calendar never to act on what a Reply says, so that a misread word cannot cancel or change anything.
59. As an Admin, I want to set the name and phone number given in the automatic answer, so that Susan is pointed to whoever is best placed to help.

### Knowing whether texts arrived

60. As anyone signed in, I want each Reminder and Change notice to show whether it is waiting, sent, delivered or failed, so that I can check what Susan was told.
61. As an Admin, I want an Alert by email when a text to Susan fails, so that I find out even if I never open the app.
62. As an Admin, I want an Alert as an app notification on my phone as well, so that I see it quickly.
63. As an Admin, I want an Alert when a text is not confirmed delivered within a reasonable time, so that a phone that is off does not go unnoticed.
64. As an Admin, I want an Alert when a Reminder could not be sent in time at all, so that an outage does not silently swallow it.
65. As an Admin, I want an Alert to say which Appointment and which text it concerns, so that I know what to tell Susan when I call her.
66. As an Admin, I want an Alert when Susan has texted STOP and the carrier is now blocking texts to her, so that I can help her undo it.
67. As anyone signed in, I want a clear banner in the app while texts to Susan are blocked or failing, so that the problem cannot be overlooked.
68. As Susan, I want never to receive Alerts, so that I am not worried by messages meant for Admins.
69. As an Admin, I want to send Susan a test text from the app, so that I can prove the whole chain works after setup or after a problem.

### Activity updates

70. As an Admin, I want an app notification when someone else adds, changes or cancels an Appointment, naming who did it, so that I know the calendar changed without checking.
71. As an Admin, I want no Activity update for my own changes, so that I am not told what I just did.
72. As an Admin, I want one Activity update for a new Series, not one per Appointment, so that a weekly Series does not flood my phone.
73. As an Admin, I want to turn on app notifications from the app after adding it to my home screen, so that Alerts and Activity updates reach my phone.

### Seeing the calendar

74. As anyone signed in, I want the first screen to show the next Appointment in full, with its Driver and the Reminders still to be sent, and the later ones as a list beneath it, so that I see what is next without navigating.
75. As anyone signed in, I want a month view with a mark on each day that has an Appointment and the picked day's Appointments listed beneath it, so that I can find a free day or jump to a date.
76. As anyone signed in, I want to open an Appointment and see all its details, its Reminders and the texts already sent for it, so that I have the full picture in one place.
77. As anyone signed in, I want to look back at past Appointments, so that I can answer "when did she last see the cardiologist?".
78. As Susan, I want large, plain text and obvious buttons, so that I can use the app on the rare occasions I open it.
79. As anyone signed in, I want the calendar to update when someone else changes it while I am looking, so that I do not act on stale information.
80. As anyone signed in, I want to add the app to my phone's home screen, so that it opens like an app.
81. As anyone signed in, I want the app laid out for a laptop screen as well as a phone, so that I can use whichever is in front of me without a stretched or cramped page.

### Calendar subscription

82. As an Admin, I want to subscribe to Susan's calendar from Apple Calendar, Google Calendar or Outlook, so that her Appointments appear beside my own.
83. As an Admin, I want the subscription to be view-only, so that changes are only made in the app where the rules about texts apply.
84. As an Admin, I want my own subscription link, so that mine can be switched off without breaking anyone else's.
85. As an Admin, I want to switch off my subscription link and get a new one, so that a link that leaked stops working.
86. As an Admin, I want the subscription to leave out Private notes, so that a leaked link exposes as little as possible.

### AI agents

87. As an Admin, I want to create an agent key in the app's settings, so that I can connect my AI agent to the calendar.
88. As an Admin, I want to see my key only once and be able to revoke it, so that a leaked key can be shut off.
89. As an Admin, I want my agent to list and read Appointments, so that I can ask "what does Susan have next week?".
90. As an Admin, I want my agent to add, change and cancel Appointments and Series and set their Reminders, so that I can update the calendar by talking.
91. As an Admin, I want my agent's changes recorded as mine "via agent", so that the history shows where a change came from.
92. As an Admin, I want an agent's changes to follow the same rules as a person's, including Change notices and Activity updates, so that there is no back door around them.
93. As an Admin, I want my agent to see whether a text was delivered, so that I can ask "did last night's Reminder go through?".

### Setup and upkeep

94. As the owner, I want to enter Susan's mobile number in the app's settings, so that texts go to the right phone without a redeploy.
95. As the owner, I want a public page with a privacy policy and terms, so that Susan, and anyone who asks, can read what the calendar texts and what it does with her number.
96. As the owner, I want the app deployed the same way as my other apps, so that I maintain one pattern.
97. As the owner, I want the app to run on sample data when it has no backend, so that screens can be worked on and shown without touching real data.
98. As the owner, I want to see what the app costs alongside my other apps, so that an unexpected charge stands out.

## Implementation Decisions

### Foundations

- The app follows the pattern shared by Personal Command Center and Wellbeing: a Vite, React and TypeScript installable web app with hand-built CSS and no component, form, date or state library; an AWS Amplify Gen 2 backend (AppSync, DynamoDB, Node 22 TypeScript Lambdas); deployed as a new Amplify app in the same AWS account and region, on every push to `main`, with the test run gating the deploy.
- Where the two sibling apps differ, this app follows Wellbeing: URL-based routing, linting plus formatting plus type-checking, automated checks on GitHub including a backend synth check with no AWS access, configuration read from the environment, a cost tag on every resource, and `AGENTS.md` with `.scratch/` issues. `CLAUDE.md` and `AGENTS.md` are kept identical, as both files state.
- The app runs on sample data when it has no backend configuration, as both sibling apps do.
- Shared pure logic lives in one place and is imported by both the app and the backend functions, as in both sibling apps.

### Sign-in and access

- Sign-in is email and password with no second step. Self sign-up is off; the owner creates every account. Sessions are long-lived so Susan rarely signs in again. This deliberately departs from the sibling apps' required authenticator code and is expected to be tightened later.
- Every account has a display name. Accounts that belong to Admins are marked as such in the identity system when the owner creates them; the one account not so marked is Susan's. The mark decides only who receives Alerts, passed-on Replies and Activity updates. It grants no extra rights.
- Any signed-in person can read everything. This is safe only because accounts are created by hand.

### One calendar core

- All rules live in a single module, the calendar core. It is the only thing that writes calendar data and the only thing that decides what gets sent to whom.
- The core exposes commands (add, change, cancel and delete an Appointment; add, change and end a Series; set Reminders; change settings; create and revoke agent keys and subscription links; send a test text), a clock-driven "run what is due" operation, and handlers for two inbound events (a delivery report and a Reply). Delivery reports are not pushed to the app: the scheduled run asks the text sender for the status of each text still unsettled and hands the core what it learns.
- The core depends on four narrow ports: a store, a text sender, an Admin messenger (email and app notification) and a clock. The Admin messenger also tells the core who the Admins are, and the core decides which of them is told. The core contains no provider-specific code. Textbelt sits behind the text sender port, which is the single seam ADR 0002 keeps.
- Every command carries the acting person and whether they acted through an agent, and the core stamps "added by" and "last changed by" from that.
- The app reads data directly from the data API with live updates, but writes only by calling the core's commands, exposed as custom operations on the data API. The app, the MCP server and the scheduled run all go through the same core, so the rules cannot be bypassed by any of them.
- In the backend the core writes through the data API, not straight to the tables, so that a change made by any of them reaches every open app (ADR 0003).
- A command the core will not carry out is refused with words written for the person who asked, and changes nothing. A command that changes the calendar leaves exactly one activity record; a refused command, and one that changes nothing, leaves none. An add carries the new Appointment's ID, so that the same add sent twice is carried out once.

### Time

- Every date and time means Susan's local time, in one configured time zone (US Eastern). Nothing depends on the time zone of the device or of the server. Daylight-saving changes are handled by resolving times in Susan's zone.
- An Appointment's date and times are kept as Susan would say them, a date and a clock time, with the moment it starts worked out from them. A start time that does not exist, in the hour the clocks skip on the night they go forward, is refused. One that happens twice, on the night they go back, means the first of the two.

### Appointments and Series

- An Appointment has: what it is and a date and start time (both required); who it is with; where (name and address); a Driver name and pickup time; a Note for Susan; Private notes; its Reminders; its state (active or cancelled); and who added and last changed it, and when.
- There is no end time, no category and no attachment.
- Cancelling keeps the Appointment. Deleting is refused once any text about it has gone to Susan. A cancelled Appointment cannot be changed or cancelled again; it can still be deleted, on the same condition.
- A Series holds a repeat pattern (weekly on chosen weekdays, every N weeks, or monthly), an end (a date, or none) and the details and Reminders its Appointments start with. The repeat-rule library used by Personal Command Center is the prior art for patterns.
- Appointments in a Series are real Appointments, created ahead of time up to a rolling horizon and topped up periodically for a Series with no end.
- "Only this one" changes that Appointment and marks it as individually changed. "This and all later ones" ends the Series at that point and continues it as a new Series with the new details; later Appointments are replaced, including ones individually changed.
- Reminders set on a Series are gap-based only. An exact-time Reminder can be added to an individual Appointment in a Series.

### Reminders

- A Reminder has one of three shapes: a gap before the Appointment's start (minutes, hours or days); a number of days before at a fixed clock time (the shape of the default, "the day before at 6:00 pm"); or an exact date and time.
- Gaps are measured from the Appointment's start time, not the pickup time.
- The first two shapes are recalculated whenever the Appointment's time changes. An exact-time Reminder keeps its time and is flagged for review when its Appointment moves.
- A new Appointment starts with one Reminder: the day before at 6:00 pm. The default set is not configurable in this version.
- The form warns when a Reminder falls between 9:00 pm and 7:00 am, tells the person when a Reminder's time has already passed, and asks for confirmation before saving an Appointment with no Reminder still to be sent.
- A due Reminder is sent on the next run. A Reminder found overdue is still sent as long as the Appointment has not started; otherwise it is recorded as not sent and an Alert is raised.
- A Reminder that was sent and whose Appointment then moves is due again at its newly calculated time.

### Wording

- The core composes every text. A Reminder reads: the fixed opening "Susan's Calendar:", what the Appointment is, who it is with, the day in words ("today", "tomorrow", or the weekday and date) and time, where, the Driver and pickup time when present, then the Note for Susan.
- A Change notice opens the same way, says "Change:", and gives the old time and either the new time or that the Appointment is cancelled.
- Text is kept to the basic SMS character set where possible (for example, straight quotes for curly ones), so that a text is not split into more parts than its length requires.
- The exact wording of any text can be previewed in the app before it is sent.

### Change notices

- For each Appointment the core remembers what Susan was last told: the date and time in the most recent text about it.
- A Change notice is due when at least one text about the Appointment has gone out and the Appointment's current date and time differ from what she was last told, or it has been cancelled.
- Because the comparison is against what she was last told, a run of edits yields one notice describing the net change, and an edit that is reverted yields none. A short settling period after the last edit avoids sending mid-correction.
- A Change notice that becomes due between 9:00 pm and 7:00 am waits until 7:00 am, unless the old or the new Appointment time falls before then, in which case it goes immediately.
- Changes to place, Driver, pickup time or notes do not produce a Change notice; later Reminders carry the new details.

### Sending and tracking texts

- A scheduled run happens every minute, with no overlapping runs, and asks the core to send whatever is due.
- Every text (Reminder, Change notice, automatic answer, test text) is recorded with its kind, the Appointment it concerns, its words, when it was due, and a status of waiting, sent, delivered, failed or not sent.
- Each text has a deterministic identity derived from what it is about and when it was due, and is claimed before sending, so that two runs cannot send the same text twice. An ambiguous sending failure is retried a small number of times; a rare duplicate is preferred to a missed Reminder.
- Textbelt does not report delivery by itself. Each run asks it for the status of every text that is sent but not yet settled, and passes the answer to the core. Textbelt's `DELIVERED` becomes delivered and `FAILED` becomes failed; `SENDING`, `SENT` and `UNKNOWN` leave the text as sent.
- A text counts as failed when Textbelt refuses it or reports failure, when sending fails after retries, or when no delivery confirmation arrives within a configurable period (starting at 30 minutes). The Alert distinguishes "failed" from "not confirmed delivered".
- "Delivered" means the carrier accepted the text for her phone. The app never claims she read it.

### Replies and opt-out

- Every text sent names the app's reply address, and texts from Susan arrive there: one public endpoint, which checks the signature Textbelt makes with the key, rejects a call whose timestamp is more than 15 minutes old, and rejects anything else. The core records the Reply, passes it on to every Admin by email and app notification, and sends the automatic answer, which names the contact person and phone number from settings.
- The automatic answer is sent at most once in a short period, so that a run of Replies does not produce a run of answers.
- The core never interprets a Reply.
- STOP is honoured by Textbelt, not by the app, and only Susan can undo it, by replying START. When the app learns texts to Susan are blocked, from an opt-out report or from a blocked send, it raises an Alert and shows a banner until a text is delivered again.

### Alerts and Activity updates

- Alerts go to every Admin by email and by app notification. They are raised for a failed or unconfirmed text, a Reminder that could not be sent in time, blocked texts, and text credit running low: Textbelt is prepaid, and the app raises one Alert when the credit left falls below a set number (starting at 20). Alerts never go to Susan.
- Alert emails are sent through AWS's email service to the Admins' sign-in addresses. Whether this works for a handful of individually verified addresses without a separate production approval is to be confirmed during the build; a notification topic with email subscriptions is the fallback.
- Activity updates go to the other Admins by app notification only, when an Appointment or Series is added, changed or cancelled. The person who made the change is excluded, as is the Admin whose agent key made it. A Series produces one update.
- App notifications use web push, following the sibling apps, with the Wellbeing approach to key management that needs no secret to be set up: the key pair is made on first use and kept in the data API. Unlike Wellbeing, which has one owner and makes the pair in the browser, the backend makes it and keeps it out of reach of anyone signed in, so the private half never reaches a browser. Each person's devices are stored against their account. A device that reports its subscription gone is forgotten, and signing out forgets the device it was on.
- An Activity update names who made the change (or "Linda's agent"), the Appointment and when it is, and for a change, which details changed, with the old date, start time or name of what it is. It gives no other detail's words, because it shows on a locked phone. Tapping it opens the Appointment. Deleting an Appointment entered by mistake sends none.
- On an iPhone, app notifications require the app to be added to the home screen first; the app explains this where notifications are turned on.

### MCP server

- A public endpoint serving the Model Context Protocol, following the sibling apps: bearer keys stored only as hashes, limited concurrency, built on the official MCP library as in Wellbeing.
- Any signed-in person can create a key in settings. It is shown once, belongs to that person, and can be revoked.
- Tools cover reading Appointments, Series and text statuses, and every command a person has for Appointments, Series and Reminders. Each call goes through the calendar core as that person, marked "via agent".
- Tools do not expose settings, keys, subscription links or account management.

### Calendar subscription

- A public endpoint serving a standard iCalendar feed, addressed by a per-person secret link that is stored only as a hash, can be switched off, and can be replaced.
- The feed contains active Appointments with what, who with, where, Driver and pickup time, and the Note for Susan. It leaves out Private notes and cancelled Appointments. Since Appointments have no end time, each is shown with a nominal one-hour length.

### Settings and public page

- Settings hold Susan's mobile number and the contact name and phone number for the automatic answer. The Textbelt key is held as a deployment secret, never in data or code.
- A public page at `/about`, reachable without signing in, carries a short description of the service, a contact address, a statement that Susan has agreed to be texted with the Confirmation text beneath it, a privacy policy stating that phone numbers and consent are never shared with third parties, and terms covering message frequency, "message and data rates may apply", and STOP and HELP. The policy and the terms also have a page each, at `/privacy` and `/terms`, so that either can be handed to someone on its own. No registration depends on these pages (ADR 0002); they are the plain account of what the calendar texts and what it does with her number.
- The contact address and the owner's name shown on the public pages are set at deploy, from the environment, and are not written in the repository.

### Screens

- The screens are: Upcoming, Month, Appointment detail (details, Reminders, texts sent, who added and changed it), Appointment form (including Series options and Reminder preview), Past, Replies, and Settings.
- **Upcoming is the first screen.** It leads with one large card for the next Appointment: the day in words ("Tomorrow"), the time in large type, what it is, who with and where, the Driver and pickup time, and each Reminder still to be sent. The Appointments after it follow as a plain list, one row each, with the date at the start of the row.
- **Month** is a month grid with a mark on each day that has an Appointment. Picking a day lists that day's Appointments beneath the grid, followed by the ones after it.
- **The app is built for phone and desktop widths alike; neither is an afterthought.** Upcoming and Month are separate tabs at every width; they are never combined on one page. The owner rejected a sketch that put them side by side.
- **On a phone**, the tabs (Upcoming, Month, Replies, Settings) sit in a bar along the bottom, and Appointment detail and the Appointment form are full screens.
- **On a desktop-width screen**, the page has three columns. A sidebar on the left holds the app name, a "New Appointment" button, and the tabs (Upcoming, Month, Past, Replies, Settings). The middle holds the current tab. A detail panel on the right shows the picked Appointment: its date and time, its Reminders with their status, the exact text Susan will read, its Private notes, Edit and Cancel, and who added and last changed it. On the Upcoming tab the next Appointment is picked to begin with. The Appointment form opens in the same panel.
- **On the desktop Month tab**, the month grid fills the middle column, with each Appointment shown in its day's cell by time and name. Picking one opens it in the detail panel.
- A banner appears on every screen while texts to Susan are blocked or the most recent one failed.
- Type is large and controls are plain throughout; there is no separate simplified mode for Susan.
- Mockups of the chosen layouts are in `docs/design/`. They fix layout and content, not colour.
- The layout was chosen from Mobbin references in November 2026. On a phone, the next-Appointment card follows Zocdoc and Superpower, and the month grid over a day's list follows Todoist, Weverse, Amazon Alexa and Binance (iOS screens). On a desktop, the list with a detail panel follows Calendly, Time2book and Luma, and the full month grid follows Buffer and Remote (web screens).

## Testing Decisions

- A good test here states a situation in the calendar's own terms and checks what a person would observe: which texts would go to Susan, with what words and when; what the Admins are told; what the calendar shows afterwards. It does not check how the core is organized inside, which functions call which, or the shape of stored records.
- **The calendar core is the main seam, and nearly all behaviour is tested there.** Tests drive it through its commands, its "run what is due" operation and its inbound events, with in-memory stand-ins for the store, text sender, Admin messenger and clock. Series expansion, Reminder timing, wording, Change notice rules, overnight holding, failure detection, Alerts and Activity updates are all tested through this one seam, not individually.
- Core tests must cover, at least: each Reminder shape; a moved Appointment before and after a Reminder went out; repeated and reverted edits; cancellation; an overdue Reminder before and after the Appointment's start; overnight Change notices on both sides of the 7:00 am rule; daylight-saving changes; both kinds of Series change; a text sent only once across overlapping runs; each route to an Alert; Replies and the limited automatic answer; and attribution of changes made via an agent.
- Core tests run with the machine's time zone set to something other than US Eastern, to prove that Susan's time zone comes from configuration. This differs on purpose from the sibling apps, whose tests run in US Eastern.
- **A second, thin seam is the screens**, tested with a browser-like test environment against the sample-data store, as Wellbeing does. These cover what the core cannot: the starting Reminder appearing on a new Appointment, the overnight warning, the confirmation when no Reminder will be sent, the "this one or all later ones" choice, and the banner.
- The Textbelt adapter gets a small number of tests against recorded examples, chiefly that a forged Reply is rejected and that Textbelt's statuses map to the app's.
- The backend definition is checked by synthesizing it with no AWS access in the automated checks, as Wellbeing does.
- Prior art: Personal Command Center's pure reminder planner and its tests (deciding what is due and avoiding repeats); Wellbeing's screen tests and synth check; family-photo-app's core with ports and adapters.
- Real delivery to a phone is not tested automatically. It is checked by hand with the test text after setup and after any change to sending.

## Out of Scope

- Texts to anyone but Susan, including Drivers and Admins.
- Two-way texting: asking Susan to confirm, or acting on what she replies.
- Summary texts, such as a morning or weekly overview.
- Automated voice calls.
- Change notices for changes to place, Driver, pickup time or notes.
- A second step at sign-in, sign-in by texted code, passkeys, invitations, self sign-up with approval, and roles or differing rights.
- A second person's calendar.
- End times, categories and attachments on Appointments.
- A configurable default set of Reminders.
- Bringing Appointments in from, or writing them out to, Google Calendar or any other calendar. The subscription is view-only.
- Approval of an agent's changes before they take effect.
- Sending texts from a number registered in the owner's name, through Twilio, AWS or any other provider (see ADR 0002).
- Recording whether Susan attended an Appointment.

## Further Notes

- **Nothing waits on a review.** Textbelt needs no registration, so the order of work is set only by the tickets' own blockers. Until the key is stored as the deployment secret, the text sender is exercised against a stand-in.
- **Nothing is sent to Susan until go-live.** The owner has chosen to receive every real text on the owner's own phone while the app is built: after ticket 13, the owner stores the key and enters that phone's number in Settings, where Susan's will later go. Her number is entered, and her Confirmation text sent, only at ticket 18.
- **Only the owner can do these:** buy and top up the Textbelt key; send Susan the Confirmation text (`docs/text-message-setup.md` has the words and the command); connect the repository to a new Amplify app; create the accounts; save the number the texts come from in Susan's iPhone contacts under a name she will recognize.
- **To confirm on a real phone during the build,** because Textbelt's documentation does not say: whether a Reply of STOP also reaches the reply address and what a send to a number that has opted out returns; whether HELP is answered by Textbelt or reaches the reply address like any other word; and whether a two-segment text shows on her iPhone as one message or two. Also the Alert email question noted above.
- **Confirmed on 19 November 2026:** Textbelt wants opt-out wording in the first text to a person and adds its own if it is missing. That first text is the Confirmation text. Reminders and Change notices do not carry it, so their wording above stands. The Confirmation text is sent once, by hand, with the command in `docs/text-message-setup.md`; the app does not send or record it. No text may hold a web address, which Textbelt does not send without permission.
- **Susan's consent is not the app's business.** She agreed to be texted before the app existed, and the owner holds that agreement. There is no consent script, and no record of consent is kept in the app or the repository.
- **Decided on 19 November 2026 (ADR 0002):** no provider will register a number for texting a family member, so texts go through Textbelt, which sends from its own numbers. Its known weaknesses: the sending number is the same one only "whenever possible", so Susan could one day get a text from a number that is not in her contacts, and the app cannot detect that; Textbelt does not disclose how its numbers are registered with carriers; and it publishes no delivery figures. If one of these bites, the fallback is an Android phone on its own line, described in `docs/research/text-message-options.md`.
- **The 30-minute "not confirmed delivered" period is a starting guess.** If Susan's carrier omits confirmations, texts stay at "sent", every one raises a false Alert, and the period or the rule should change. The trial text to the owner's phone was confirmed delivered; hers is first seen with the Confirmation text.
- **Expected running cost:** about $5 to $15 a year to Textbelt, bought as credit in advance, plus a small AWS bill in line with the sibling apps.
- Consent, Susan's phone number and Appointment details are personal information about one private person. Nothing in logs, error messages or Alerts should include more of it than the reader needs.
