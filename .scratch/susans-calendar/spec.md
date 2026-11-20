# Spec: Susan's Calendar

**Status:** ready-for-agent

This spec uses the vocabulary in `CONTEXT.md` (Susan, Admin, Appointment, Series, Reminder, Change notice, Confirmation text, Reply, Alert, Activity update, Public pages, Driver, Note for Susan, Private notes) and respects ADR 0002 (text messages are sent through Textbelt), which supersedes ADR 0001.

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
- The core exposes commands (add, change, cancel and delete an Appointment, setting its Reminders as part of adding or changing it; add, change and end a Series; change settings; create and revoke agent keys and subscription links; send a test text), a clock-driven "run what is due" operation, and handlers for inbound events (a delivery report, a Reply and, as built in ticket 17, a report that Susan opted out). Delivery reports are not pushed to the app: the scheduled run asks the text sender for the status of each text still unsettled and hands the core what it learns.
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
- As built (ticket 12): the patterns are every N weeks (up to 52) on chosen weekdays, with weeks running Monday to Sunday and counted from the week the Series starts, and every N months (up to 12) on the day of the month it starts, landing on the last day of a shorter month. They follow Personal Command Center's rules without its library, since only these patterns are offered. A Series' first Appointment is on the date it starts, which must be a day the pattern gives. **Decided by the owner (ticket 12):** a start a person enters is refused when the clocks skip it, as for any Appointment, including a Series' first date and a date or time entered when changing this and all later ones. On any other date the Series' time is worked out, and the night the clocks skip it the Appointment still happens: it starts that much later, moved on by the jump the zone's clocks make (2:30 am becomes 3:30 am in US Eastern; 2:15 am becomes 2:45 am where they jump half an hour), on the date and at the time it then really starts, the next day where the jump crosses midnight, and it says that it was moved and why, in its detail and in lists. It keeps its place in the pattern. A Reminder that the jump puts at or after its start, because the start moved or because the Reminder's own time was skipped, is held for review: kept and shown, never sent, until someone changes or removes it, and it cannot be confirmed as it is. Any other Reminder at or after the start is refused as usual. Every other date stays at the Series' time, after a top-up too. Changing such an Appointment on its own in another way keeps the note that it was moved; changing its date or time drops it. Changing this and all later ones from it, in another way, keeps it moved and leaves the later dates at the Series' time.
- As built: the rolling horizon is 182 days after today, or after the Series starts when that is later. A scheduled function, apart from the one that sends texts, tops up every Series once a day. The top-up leaves no activity record and sends no Activity update, and each Appointment it makes counts as added by whoever added the Series. It never brings back an Appointment deleted from a Series.
- As built: "gap-based" means the two shapes that follow the Appointment, a gap before it and days before at a clock time, so a Series starts with the default Reminder. "Only this one" applies to cancelling as well as changing. With "this and all later ones", what is not changed comes from the Series, which undoes what was changed on its own; a later Appointment on a date the new Series also has is changed in place, keeping its identity for Change notices, and any other is removed, or cancelled if Susan has been texted about it. Cancelling this and all later ones keeps them, marked cancelled. Deleting is for one Appointment only. "Later ones" include those of a Series already continued from a later Appointment: a Series and its continuations are one line, and a change or cancellation from a point is for all of it from there. A change keeps the end the line was going to have unless a new one is given. A change or cancellation cut off partway is carried out in full when sent again.

### Reminders

- A Reminder has one of three shapes: a gap before the Appointment's start (minutes, hours or days); a number of days before at a fixed clock time (the shape of the default, "the day before at 6:00 pm"); or an exact date and time.
- Gaps are measured from the Appointment's start time, not the pickup time.
- The first two shapes are recalculated whenever the Appointment's time changes. An exact-time Reminder keeps its time and is flagged for review when its Appointment moves. While it is flagged it is not sent: it goes out at its time only once someone keeps it or changes it, so that it cannot go out at a time that no longer makes sense (story 38). The detail shows it as waiting for review; the Upcoming card and the phone Month count, which show the Reminders still to be sent, leave it out. One whose time comes while it is still flagged is not sent, and keeping it after its time has passed does not send it late.
- Reminders are set in the same save as the Appointment's details, so a save that adds or changes an Appointment and its Reminders leaves one activity record.
- A Reminder that is newly set, changed, or confirmed after review must go out strictly before the Appointment starts; one at or after the start is refused. An exact-time Reminder that a move leaves at or after the new start is kept, shown and flagged until someone changes or removes it. A move that would put a recalculated Reminder (a same-day clock time) at or after the new start is refused, naming that Reminder.
- A newly chosen exact time that the clocks skip when they go forward is refused. A Reminder worked out from a gap in days or a clock time that lands in that skipped time goes out that much later, moved on by the gap the clocks jump (2:30 am becomes 3:30 am in US Eastern).
- A new Appointment starts with one Reminder: the day before at 6:00 pm. The default set is not configurable in this version.
- The form warns when a Reminder falls between 9:00 pm and 7:00 am, tells the person when a Reminder's time has already passed, and asks for confirmation before saving an Appointment with no Reminder still to be sent.
- A due Reminder is sent on the next run. A Reminder found overdue is still sent as long as the Appointment has not started; otherwise it is recorded as not sent and an Alert is raised.
- **Decided by the owner during ticket 11:** a Reminder whose due time had already passed when that time was set is never sent and leaves no record; the form already tells the person so. Only a Reminder whose time was still to come when it was set, and that became overdue while it waited, is caught up, and only while the Appointment has not started. A time set for the very moment it is set is not past: it is due, and goes out. So each Reminder keeps when its due time was last worked out (`setAt`): when it was set, changed or confirmed after review, or moved by its Appointment. An edit that leaves its time alone, such as a new note, leaves this alone too, and it is not a change to the Reminders that an Activity update reports.
- Reminders kept before ticket 11 have no such record. Each is taken to have been set at its Appointment's last save, the latest moment anyone could have set it, until the next save records that moment for it; one whose Appointment has already started is let go without a record, since nothing was sending texts then.
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
- As built in ticket 14: what Susan was told is kept on each text's own record (its date and time, and whether it said the Appointment is cancelled), so it stays true however the Appointment changes afterwards. "Gone out" means a text the text sender is recorded as having taken (it has a sent time). A text a run claimed and stopped on before sending, or one tried with no answer, does not count, so she is never sent news about an Appointment no text is known to have reached her about. This is narrower on purpose than the rule that refuses deleting, which still counts any text that may have reached her. A text the sender later reports undelivered is left out of what she was told; one sent but not confirmed delivered still counts, since most likely it arrived. The most recent is the one the sender took last. A cancellation notice names the time she was last told. A text recorded before ticket 14 has no such record and is passed over.
- As built in ticket 14: the settling period is five minutes after the Appointment's last edit of any kind, and a notice's identity is made from the Appointment and when it is due, so overlapping runs send it once and a waiting one is tried again like a Reminder. One is tried again only while the Appointment is still as it says; one that a later edit made wrong is given up as failed, and the next notice is told from the last text the sender took. In a run, Change notices go before Reminders. A notice that fails, or is recorded as not sent, raises one Alert like any text (ticket 15), its reason worded for a notice: changed again, or its old and new times had passed.
- **Decided by the owner during ticket 14:** an edit made once both the old and the new Appointment starts have passed sends no Change notice and creates no text record. The old start is the time she was last told; an edit at the very moment the later of the two starts counts as after it. The edit itself still leaves its Activity record as usual. A notice that was owed for an earlier edit, and that the scheduled run reaches only after both starts have passed, is still recorded as not sent (`tooLate`), as built.
- **Decided by the owner during ticket 14:** a Change notice that comes up overnight skips the wait until 7:00 am only when the old or the new Appointment start is strictly after the edit and strictly before that local 7:00 am, in Susan's time zone. A start at or before the moment of the edit, such as an old time that has already passed, cannot hurry it through the night when the other start is after 7:00 am, and a start at 7:00 am itself is not before then. "That 7:00 am" is the first one after the notice would otherwise fall due. This is the rule as built.

### Sending and tracking texts

- A scheduled run happens every minute, with no overlapping runs, and asks the core to send whatever is due. Only one run may go at a time, and a run that cannot start is dropped rather than queued or retried, since the next is a minute away.
- Wherever Textbelt's key is absent, including sample data, the text sender is a stand-in that records each text instead of sending it. The app says so in Settings.
- Every text (Reminder, Change notice, automatic answer, test text) is recorded with its kind, the Appointment it concerns, its words, when it was due, and a status of waiting, sent, delivered, failed or not sent. From ticket 14, a text about an Appointment also records what it told her of the Appointment's date and time, from which Change notices are worked out.
- Each text has a deterministic identity derived from what it is about and when it was due, and is claimed before sending, so that two runs cannot send the same text twice. An ambiguous sending failure is retried a small number of times; a rare duplicate is preferred to a missed Reminder.
- As built in ticket 11: a text is claimed by creating its record under that identity, which the data API refuses when the record exists. A Reminder's identity names the Appointment, the Reminder and its due time, so a Reminder whose Appointment moves is a new text at its new time. A send that might or might not have gone through stays waiting and is tried again by a later run, at least two minutes after the last try, up to three tries in all; a later run also takes up a claim a stopped run left behind. A refused send is failed at once and not tried again. A waiting text is taken up again only by a conditional write that finds it still as the run read it, so two runs that overlap cannot both try it again.
- Before a Reminder is tried again, it is checked afresh. It is not tried again, and is recorded as failed, once its Appointment has been cancelled or has started, or once the Reminder has been removed or its time changed; a Reminder at a new time is a new text, sent at that time. It is held, not tried, while it is flagged for review. When it is tried again, it carries the Appointment's details as they now are. A text given up after a try counts as failed, never as not sent, because that try may have reached Susan.
- The cutoff is the Appointment's start at the moment each text is sent, not when the run began: a slow earlier send in the same run can carry the clock past a later Appointment's start. A Reminder whose Appointment has started by then is not sent. It is recorded as not sent if it was never tried, and as failed if an earlier try might have reached her.
- While Susan's mobile number is not set, nothing is sent: each Reminder that comes due is recorded as not sent, saying so, and setting the number later sends none of them.
- Deleting an Appointment is refused once any text about it may have reached Susan: anything but a text recorded as not sent, or one the sender refused on its only try. One refused when tried again may have gone on its first try (ticket 13).
- Where a failure could involve Susan's number or a text's words, at the scheduled run and the commands, logs and errors carry only fixed words: which operation failed, and what kind of failure it was (timeout, network, access, data and so on). Never the error's message, stack or cause.
- Textbelt does not report delivery by itself. Each run asks it for the status of every text that is sent but not yet settled, and passes the answer to the core. Textbelt's `DELIVERED` becomes delivered and `FAILED` becomes failed; `SENDING`, `SENT` and `UNKNOWN` leave the text as sent.
- A text counts as failed when Textbelt refuses it or reports failure, when sending fails after retries, or when no delivery confirmation arrives within a configurable period (starting at 30 minutes). The Alert distinguishes "failed" from "not confirmed delivered".
- "Delivered" means the carrier accepted the text for her phone. The app never claims she read it.
- **As built in ticket 13:** the text sender port both sends and answers what became of a text it took, as delivered, failed or still pending; Textbelt's statuses are turned into those three only in the Textbelt sender. Sends go one at a time; once they are done, the run asks about up to four texts at once (`STATUS_READS_AT_ONCE`), the oldest first, each recorded as its answer comes, and Textbelt is given five seconds to answer each, so one slow answer holds up no other and a run cut short keeps what it learned. A text that is waiting to be confirmed is asked about on every run, even after the period, so a late `DELIVERED` still counts, and a status that cannot be read is asked for again on the next run; a text with no confirmation once the period has passed is failed as not confirmed delivered either way. The period is set at deploy (`TEXT_CONFIRMATION_MINUTES`, 30 if unset). The stand-in names none of the texts it records, and a text its sender gave no name is never asked about, so it stays sent and is never marked not confirmed: nothing could confirm a text that went to no phone. The credit Textbelt says is left, with each send and each refused one, is kept on that text's record, where ticket 17 reads the newest. A refused send is failed and never retried, whatever the HTTP status, when Textbelt's answer says `success: false`; any answer that does not say, such as a server error, counts as not knowing whether it went. Which sender is in use is asked of the backend when Settings opens, since the key is a secret that can be stored after a deploy.
- **As built in ticket 13, no text holds a web address:** the core checks the words of every text, of every kind, at the one place each passes before it is sent, and sends none that holds a web address: a link with its scheme, a "www." address, a host name ending in a country's two-letter domain or a widely used generic one (`example.de`, `example.xyz`), or an email address. Ordinary punctuation is not taken for one ("medicines.Then", "e.g.", "10.am"). Such a text is recorded as not sent, or failed if an earlier try may have gone, with the reason. Nothing a person types is refused or changed for it: the Reminder's preview, in the form and on the Appointment, warns that the text will not be sent, and its status reads "Will not be sent" until the address is taken out. Such a Reminder is not one still to be sent: the Upcoming card and the phone Month count leave it out, as they do one held for review, and the form asks for confirmation before saving an Appointment whose only Reminders still to come are such, as it does for one with no Reminder, saying why. All of these use the one check the core makes before sending (`reminderHoldsWebAddress`). Refusing to save such details was considered and left out; it is the owner's to ask for. A core test drives a text of every declared kind with an address through the sending check; Change notices (ticket 14) and the automatic answer (ticket 17) add tests of their own words.

### Replies and opt-out

- Every text sent names the app's reply address, and texts from Susan arrive there: one public endpoint, which checks the signature Textbelt makes with the key, rejects a call whose timestamp is more than 15 minutes old, and rejects anything else. The core records the Reply, passes it on to every Admin by email and app notification, and sends the automatic answer, which names the contact person and phone number from settings.
- The automatic answer is sent at most once in a short period, so that a run of Replies does not produce a run of answers.
- The core never interprets a Reply.
- STOP is honoured by Textbelt, not by the app, and only Susan can undo it, by replying START. When the app learns texts to Susan are blocked, from an opt-out report or from a blocked send, it raises an Alert and shows a banner until a text is delivered again.
- **As built in ticket 17:** every text Textbelt sends names the reply address (`replyWebhookUrl`), the public address of the `text-replies` function. It takes only a POST whose `X-textbelt-signature` is the hex HMAC-SHA256, keyed with the Textbelt key, of `X-textbelt-timestamp` followed by the raw body, compared in constant time, and whose timestamp is within 15 minutes of now either way; it takes nothing while no key is stored. Its body must have the `textId`, `fromNumber` and `text` Textbelt documents, with a number the calendar can read. It hands the Reply to the core's inbound event (`receiveReply`), which keeps it only when it came from Susan's number in Settings: one from any other number, or while hers is not set, is kept nowhere, passed on to nobody and not answered, and the reply address answers it as it answers one it kept. A Reply keeps its words (without unseen characters, up to 1,600 characters), when it came, and the revision of Susan's number it came under (`numberRevision` in Settings, which moves on with every change of her number and nothing else); never the number itself. The same request arriving twice is kept once. The reply address does nothing else: the scheduled run, within a minute, sends the automatic answer and passes the Reply on, so that texts still go one at a time and email still goes only from the scheduled run, with an Alert's per-Admin, per-channel retries. The automatic answer reads "Susan's Calendar: Texts to this number are not answered. If you need anything, please call" the contact name and number (either alone if only one is set; "someone who helps you" if neither), and goes at most once an hour, counted from when the last answer was claimed for sending, not from when Replies came: a Reply taken up less than an hour after the last answer gets none, so a backlog taken up together gets one, and the Replies tab and the passed-on Reply say so. Each answer is claimed under the next number after the last answer a run can see, so two runs at once cannot both send one. It goes, first and on any later try, only while Susan's number is still at the revision the Reply came under; once it has changed, nothing is sent to the new number, a Reply not yet answered says so, and an answer waiting to be tried again fails, raising its Alert. A change to the contact alone leaves Replies to be answered, with the new contact. The Replies tab counts, for each person, the Replies that came after the newest they have seen; opening it counts them seen, through the `seeReplies` command, on every device that person uses, by writes that only ever move the mark on.
- **As built in ticket 17, blocked texts:** the text sender says a refused send was blocked because the number opted out; the text is then failed as blocked, and its Alert says texts to Susan are blocked and only she can undo it, by replying START. An opt-out report is the core's other inbound event (`recordOptOut`), which raises one calendar Alert. Textbelt documents neither: what a send to a number that opted out returns, and whether STOP reaches the reply address, are to be seen on a real phone (Further Notes). Until then the Textbelt sender takes no refusal as blocked (its list of such refusals, `TEXTBELT_OPTED_OUT_ERRORS`, is empty), so such a send fails and its Alert says "failed"; and a STOP that reaches the reply address is a Reply like any other, never read for meaning. Texts count as blocked from the latest such send or report until a text sent after it is delivered.

### Alerts and Activity updates

- Alerts go to every Admin by email and by app notification. They are raised for a failed or unconfirmed text, a Reminder that could not be sent in time, blocked texts, and text credit running low: Textbelt is prepaid, and the app raises one Alert when the credit left falls below a set number (starting at 20). Alerts never go to Susan.
- Alert emails are sent through AWS's email service (SES) to the Admins' sign-in addresses. **Confirmed on 20 November 2026 from AWS's documentation** ("Request production access" in the SES developer guide, and the SendEmail API reference): an account still in the SES sandbox, with no production access, can send only from a verified identity to verified email addresses or domains, at most 200 messages in 24 hours and one a second, and the sandbox is separate in each AWS Region. A handful of Admins fits within that, so no production approval is needed: the owner verifies the sending address and each Admin's sign-in address in SES in the app's region (README, "Alert emails"). The notification-topic fallback is not used. AWS recommends one send per recipient, since a failed send rejects the whole email, so each Admin gets their own. That a real email arrives is checked by the owner once, by hand.
- **As built in ticket 15:** an Alert is raised for a text of any kind (a Reminder, a Change notice, a test text) whose record reaches failed, for any reason, or not sent because it could not go before the Appointment started, or because Susan's mobile number was not set when it came due. The last is worded as a gap in the setup, not as a failure or a late Reminder; until her number is entered, every Reminder that comes due raises one. A text not sent because its words held a web address (ticket 13) raises one worded apart from all of these, which never repeats the address; an Appointment whose name holds one is named in an Alert only by its time. A failed test text raises one too, so that a deliberate failure proves both channels (ticket 18). A Reminder held for review has no text record, so it raises none; whether it should is still the owner's to decide (ticket 11). Texts recorded before ticket 15 raise none.
- Each text raises one Alert, sent by the scheduled run, the only function that may send email; a command that fails a test text marks its Alert due for the next run. Each delivery (one email to one Admin, one app notification to one device) is recorded as soon as it goes and never sent again. A run takes the Alert up by a conditional write, so one run at a time sends it; one that failed a delivery leaves it due, and a later run, two minutes on, sends only what failed, up to three tries. A delivery refused for good is recorded as refused and never tried again, even while another delivery of the same Alert is retried; one with nothing to reach (email not set up, no address, no device) is not a failure and is not tried again either. A run that stops part way leaves the Alert to be taken up by a later run once it has been held longer than any run lasts, and the three tries count that run's: one that stopped on the third is not taken up a fourth time, and what had not gone is given up, logged only as counts. The one repeat that can happen is a delivery that SES or a push service accepted just before a run stopped, before the run wrote its record: the run that takes over sends it again. An Alert leaves out any phone number typed into an Appointment's name, which it still identifies by its date and time.
- **As built in ticket 17:** an Alert about texts as a whole, not one text, is a calendar Alert, kept on its own and sent by the scheduled run the same way: texts blocked by an opt-out report, and low credit. One low-credit Alert is raised when the credit the text sender last reported falls below 20, and no other until a later report shows it at 20 or more again, so readings that arrive out of order raise no second one. It says how much is left and opens Settings. A text's own Alert also covers the automatic answer, and opens the Replies tab.
- An Alert names the Appointment (what it is, its date and time), the text (its kind, and when it was due) and why: "failed", "was not confirmed delivered", "could not be sent in time", or "was not sent" because her number was not set. A test text's Alert says it was sent from Settings. It never holds Susan's number, the text's words, or the Appointment's place, Driver, notes or who it is with. The email ends with a link to the Appointment, or to Settings for a test text, and tapping the app notification opens it. Alert emails come from an address set at deploy; without one, Alerts go by app notification only, and the scheduled run may not send email. With one, it may send only from that address (`ses:FromAddress`), through SES identities in its own account and region, as AWS's SES v2 authorization reference allows.
- What became of a sent text reaches the core in provider-neutral words: delivered, reported not delivered, or not confirmed delivered in the time allowed. The scheduled run's status poll (ticket 13) maps Textbelt's report and its period to these, and `recordDelivery` takes them from anywhere else. Either way the text is settled once, by a write that finds it still sent and marks its Alert due in the same write. The run sends Alerts only after every send and every answer of its poll, one delivery at a time, so a burst of answers never becomes a burst of emails past SES's sending rate.
- Activity updates go to the other Admins by app notification only, when an Appointment or Series is added, changed or cancelled. The person who made the change is excluded, as is the Admin whose agent key made it. A Series produces one update.
- App notifications use web push, following the sibling apps, with the Wellbeing approach to key management that needs no secret to be set up: the key pair is made on first use and kept in the data API. Unlike Wellbeing, which has one owner and makes the pair in the browser, the backend makes it and keeps it out of reach of anyone signed in, so the private half never reaches a browser. Each person's devices are stored against their account, and only that person turning notifications on for a device puts it there: opening the app keeps a device up to date only for the person who already has it. A device that reports its subscription gone is forgotten, and signing out forgets the device it was on, only if it is still that person's when it is deleted.
- An Activity update names who made the change (or "Linda's agent"), the Appointment and when it is, and for a change, which details changed, with the old date, start time or name of what it is, and whether someone changed the Reminders (adding, removing, retiming or confirming one; not their being worked out again when the Appointment moves). It gives no other detail's words, because it shows on a locked phone. Tapping it opens the Appointment. Deleting an Appointment entered by mistake sends none.
- On an iPhone, app notifications require the app to be added to the home screen first; the app explains this where notifications are turned on.

### MCP server

- A public endpoint serving the Model Context Protocol, following the sibling apps: bearer keys stored only as hashes, limited concurrency, built on the official MCP library as in Wellbeing.
- Any signed-in person can create a key in settings. It is shown once, belongs to that person, and can be revoked.
- Tools cover reading Appointments, Series and text statuses, and every command a person has for Appointments, Series and Reminders. Each call goes through the calendar core as that person, marked "via agent".
- Tools do not expose settings, keys, subscription links or account management.
- **As built in ticket 16:** the server is the `mcp-server` function at its own public address (a Lambda function URL ending in `/mcp`, at most three requests at once), serving Streamable HTTP stateless with JSON answers through the official MCP library, as Wellbeing's does; it offers tools only. A person can have several agent keys, each with a name they give it, made and revoked only by them in Settings (the core refuses either to an agent). A key is `sc_agent_` and 32 random bytes; only its SHA-256 hash is kept, in the `AgentKey` table, keyed by that hash, which is also how the person names a key to revoke it. Revoking deletes the key, by a delete on condition that it is the person's that DynamoDB checks as it deletes, so a key revoked the moment it is made is still revoked and nobody can revoke another's. The server finds a key by reading that table by its hash with a strongly consistent read, so a revoked key stops at once; a missing, malformed, wrong or revoked key gets one same refusal, before anything about the calendar is read. A key acts only while its person's account is enabled: the server looks the account up for the person's name at every call, and refuses a key whose account is disabled, gone, or not said to be enabled, the same way.
- As built: the tools are `list_appointments`, `get_appointment`, `list_texts` (the texts about one Appointment, with their status in the app's words), `list_series`, `get_series`, `add_appointment`, `change_appointment` (only this one), `cancel_appointment`, `delete_appointment`, `add_series`, `change_series` and `end_series` (this and all later ones); Reminders are set as the whole list on an add or change, as in the app, including confirming one held for review. Each calls the core's command or read as the key's person with `viaAgent`, so a refusal reaches the agent in the core's words and Change notices (ticket 14) and Activity updates follow as for a person. Dates and times in and out are Susan's local time, and people are named, never identified by account. Every tool's description says so, and warns that moving or cancelling an Appointment Susan has been reminded of texts her. The server sends no text and no email, and may call only the data API fields in `amplify/functions/mcp-server/access.ts`.

### Calendar subscription

- A public endpoint serving a standard iCalendar feed, addressed by a per-person secret link that is stored only as a hash, can be switched off, and can be replaced.
- The feed contains active Appointments with what, who with, where, Driver and pickup time, and the Note for Susan. It leaves out Private notes and cancelled Appointments. Since Appointments have no end time, each is shown with a nominal one-hour length.

### Settings and public page

- Settings hold Susan's mobile number and the contact name and phone number for the automatic answer. The Textbelt key is held as a deployment secret, `TEXTBELT_KEY`, never in data or code.
- Both numbers are US numbers, kept as +1 and ten digits however they were typed. Anyone signed in can read and change the settings, through the core's command; a change to them changes no Appointment and leaves no activity record. A "Send a test text" button beside them sends a Test text by the same path as a Reminder and shows its status as it changes.
- A public page at `/about`, reachable without signing in, carries a short description of the service, a contact address, a statement that Susan has agreed to be texted with the Confirmation text beneath it, a privacy policy stating that phone numbers and consent are never shared with third parties, and terms covering message frequency, "message and data rates may apply", and STOP and HELP. The policy and the terms also have a page each, at `/privacy` and `/terms`, so that either can be handed to someone on its own. No registration depends on these pages (ADR 0002); they are the plain account of what the calendar texts and what it does with her number.
- The contact address and the owner's name shown on the public pages are set at deploy, from the environment, and are not written in the repository.

### Screens

- The screens are: Upcoming, Month, Appointment detail (details, Reminders, texts sent, who added and changed it), Appointment form (including Series options and Reminder preview), Past, Replies, and Settings.
- **Upcoming is the first screen.** It leads with one large card for the next Appointment: the day in words ("Tomorrow"), the time in large type, what it is, who with and where, the Driver and pickup time, and each Reminder still to be sent. The Appointments after it follow as a plain list, one row each, with the date at the start of the row.
- **Month** is a month grid with a mark on each day that has an Appointment. Picking a day lists that day's Appointments beneath the grid, followed by the ones after it. On a phone, each row for an Appointment still to come says how many of its Reminders are still to be sent ("2 Reminders to send"), and says nothing when none are; the times themselves are on the Upcoming card and the Appointment.
- **The app is built for phone and desktop widths alike; neither is an afterthought.** Upcoming and Month are separate tabs at every width; they are never combined on one page. The owner rejected a sketch that put them side by side.
- **On a phone**, the tabs (Upcoming, Month, Replies, Settings) sit in a bar along the bottom, and Appointment detail and the Appointment form are full screens.
- **On a desktop-width screen**, the page has three columns. A sidebar on the left holds the app name, a "New Appointment" button, and the tabs (Upcoming, Month, Past, Replies, Settings). The middle holds the current tab. A detail panel on the right shows the picked Appointment: its date and time, its Reminders with their status, the exact text Susan will read, its Private notes, Edit and Cancel, and who added and last changed it. On the Upcoming tab the next Appointment is picked to begin with. The Appointment form opens in the same panel.
- **On the desktop Month tab**, the month grid fills the middle column, with each Appointment shown in its day's cell by time and name. Picking one opens it in the detail panel.
- A banner appears on every screen while texts to Susan are blocked or the most recent one failed. As built in ticket 15, "the most recent" is the text of any kind, test texts included, that was last tried and has settled; a text still being sent is passed over. A failed text, one not confirmed delivered and one not sent in time show it, and it clears once a later text is sent or delivered. When that text was not sent because her number was not set, it says so, as what happened to that text rather than how Settings stand now, and links to Settings. As built in ticket 17, while texts to Susan are blocked the banner says so, and that only she can undo it by replying START, and links to Settings; it stands until a text sent afterwards is delivered, whatever came between.
- **The Replies tab** (ticket 17) lists her Replies newest first, each with when it came, what she wrote, and what became of the automatic answer. Its tab, in the bar and the sidebar, shows how many the person has not yet seen.
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
- **To confirm on a real phone during the build,** because Textbelt's documentation does not say: whether a Reply of STOP also reaches the reply address and what a send to a number that has opted out returns; whether HELP is answered by Textbelt or reaches the reply address like any other word; and whether a two-segment text shows on her iPhone as one message or two. The steps for STOP and HELP, on the owner's own phone, are in `docs/text-message-setup.md`, "Checking STOP and HELP". Also that an Alert email reaches every Admin, once their addresses are verified in SES (README, "Alert emails").
- **Confirmed on 19 November 2026:** Textbelt wants opt-out wording in the first text to a person and adds its own if it is missing. That first text is the Confirmation text. Reminders and Change notices do not carry it, so their wording above stands. The Confirmation text is sent once, by hand, with the command in `docs/text-message-setup.md`; the app does not send or record it. No text may hold a web address, which Textbelt does not send without permission.
- **Checked again on 20 November 2026 (ticket 13),** Textbelt's documentation of the send and status requests matches what was recorded on 19 November, with these details added to `docs/text-message-setup.md`: a send's `textId` comes only with `success: true`; a refusal may or may not carry `quotaRemaining` ("Out of quota" does, "Incomplete request" does not); no HTTP status codes are documented; the five statuses are what "Possible return values include", so the app treats any other as settling nothing; asking for a status needs no key; sending a web address needs the key whitelisted, and shortened links are refused; and Textbelt asks for no more than one text a second. Not documented, and so to be seen in use: what a send holding a web address returns, and what a status request for an unknown `textId` returns.
- **Susan's consent is not the app's business.** She agreed to be texted before the app existed, and the owner holds that agreement. There is no consent script, and no record of consent is kept in the app or the repository.
- **Decided on 19 November 2026 (ADR 0002):** no provider will register a number for texting a family member, so texts go through Textbelt, which sends from its own numbers. Its known weaknesses: the sending number is the same one only "whenever possible", so Susan could one day get a text from a number that is not in her contacts, and the app cannot detect that; Textbelt does not disclose how its numbers are registered with carriers; and it publishes no delivery figures. If one of these bites, the fallback is an Android phone on its own line, described in `docs/research/text-message-options.md`.
- **The 30-minute "not confirmed delivered" period is a starting guess.** If Susan's carrier omits confirmations, texts stay at "sent", every one raises a false Alert, and the period or the rule should change. The trial text to the owner's phone was confirmed delivered; hers is first seen with the Confirmation text.
- **Expected running cost:** about $5 to $15 a year to Textbelt, bought as credit in advance, plus a small AWS bill in line with the sibling apps.
- Consent, Susan's phone number and Appointment details are personal information about one private person. Nothing in logs, error messages or Alerts should include more of it than the reader needs.
