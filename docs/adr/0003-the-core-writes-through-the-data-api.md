---
status: accepted
---

# The calendar core writes through the data API

The calendar core's commands run in a backend function, and that function writes calendar data by calling the data API with its own role, not by writing to the tables. We chose this in November 2026, when the first commands were built, because the spec asks for two things at once: only the core may write, and a change made by one person must appear for everyone else without a reload. The data API announces a change to the people subscribed to it only when the change is made through it. A write straight to a table is announced to nobody.

So the models are read-only to anyone signed in, the core's commands are custom mutations run by the function, and the function is the one caller allowed to use the models' own mutations. `npm run synth` checks all three.

## Considered options

- **Write straight to the tables**, as Wellbeing's goal function does. It gives transactions and conditional writes. Rejected because nothing would then tell the other people looking at the calendar: live updates would need a second mechanism, built and kept in step by hand, and every later writer (the MCP server, the scheduled run) would have to remember to use it.
- **Let the app write the models and check the rules afterwards.** Rejected: the rules could then be bypassed by any signed-in client, which is the one thing the calendar core exists to prevent.
- **A custom subscription fired by the command mutations.** It would announce changes made through the app, but not ones made by the MCP server or the scheduled run, which do not come in as mutations.

## Consequences

- **Every writer gets live updates for free.** Whatever runs the core in the backend, its changes reach every open app, because they go through the same data API.
- **No transactions.** A command that writes an Appointment and then its activity record makes two calls. If the second fails, the change stands without its record and the command reports a failure. An add carries the new Appointment's ID, so sending it again adds nothing twice.
- **No "only if unchanged" writes.** The data API's typed client cannot say "write this only if nobody has written since I read it". The store therefore writes only what a command changed, so that two commands on one Appointment in the same instant do not undo each other's details or a cancellation. Two that change the same detail at once still end with the later one. If that ever matters, the store port is where a stricter write would go.
- **Reads are not strictly consistent.** A command reads the Appointment through the data API, which may lag a write by a moment. A person cannot act that fast; an agent might.
- **The function needs the person's name.** The data API tells a function who is calling but not what they are called, so the function looks the name up in the user pool and remembers it for a few minutes.
- **The core stays free of all this.** It sees a store port. The sample data and the tests give it a store kept in memory, and the same core runs unchanged in all three places.
