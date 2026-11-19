# 16: MCP server and agent keys

**What to build:** A signed-in person can create a key in Settings, connect their AI agent to Susan's Calendar with it, and then read and change the calendar by talking to the agent: "what does Susan have next week?", "add her eye appointment on the 12th at 3". Changes made this way are recorded as that person's "via agent" and follow every rule a person's change follows.

**Spec:** `.scratch/susans-calendar/spec.md`, section "MCP server"; user stories 87 to 93. Both sibling apps have an MCP server; follow Wellbeing's, which uses the official MCP library.

**Blocked by:** 11 (Sending texts on schedule), 12 (Series). The tools cover Reminders, text statuses and Series, so those must exist first.

**Parallel:** Yes, with 13, 14 and 15. It fills the "Agent keys" section of Settings and nothing else there.

**Status:** ready-for-agent

- [ ] A public endpoint serves the Model Context Protocol, with limited concurrency, as in the sibling apps.
- [ ] In the "Agent keys" section of Settings, a person can create a key, see it once, and revoke it. Only a hash of each key is stored.
- [ ] A call with a missing, wrong or revoked key is refused and learns nothing about the calendar.
- [ ] Tools let an agent list and read Appointments and Series, and read the status of texts sent for an Appointment.
- [ ] Tools let an agent add, change and cancel Appointments and Series and set their Reminders.
- [ ] Every tool call goes through the calendar core as the key's owner, marked "via agent". The Appointment's history reads accordingly.
- [ ] An agent's change follows the same rules as a person's, including Change notices to Susan and Activity updates to the other Admins.
- [ ] Tools do not expose Settings, keys, subscription links or accounts.
- [ ] Each tool's description tells an agent that all times are Susan's local time, and warns that changing an Appointment she has been reminded of sends her a text.
- [ ] Tests cover a refused key, attribution of a change, and that a change through a tool produces the same outcome as the same change through the app.
- [ ] The README explains how to connect an agent.
