// The MCP server for one call, made afresh for each (stateless), with the tools an agent is given.
// Every tool goes through the calendar core as the key's person, via agent: the same commands, and
// so the same rules, Change notices and Activity updates, as a person's change in the app. A refusal
// reaches the agent in the core's own words. There is no tool for settings, keys, subscription
// links or accounts, and the server offers nothing but tools.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  CalendarRefusal,
  REMINDER_SHAPES,
  REMINDER_UNITS,
  REPEAT_KINDS,
  type Actor,
  type CalendarCore,
  type Clock,
} from '../../../src/lib/calendar';
import { today } from '../../../src/lib/localTime';
import { logFailure } from '../../calendar/log';
import { presentAppointment, presentSeries, presentText } from './present';

export const SERVER_INFO = { name: 'susans-calendar', version: '1.0.0' };

export interface ToolContext {
  core: CalendarCore;
  /** The key's person, acting through their agent. */
  by: Actor;
  clock: Clock;
  timeZone: string;
}

/** Said to the agent when a tool failed for a reason that is nobody's mistake. */
export const TOOL_FAILED =
  'The calendar could not be read or changed just now. Try again in a minute.';

/** Ends every tool's description, so that an agent reads it whichever tool it looks at. */
const aboutTimeAndTexts = (timeZone: string) =>
  ` All dates and times are Susan's local time (${timeZone}): dates are YYYY-MM-DD and times are` +
  ' 24-hour HH:MM. Moving or cancelling an Appointment Susan has already been reminded of sends' +
  ' her a text (a Change notice), and each Reminder is a text to her phone.';

const instructions = (by: Actor, timeZone: string) =>
  "Susan's Calendar holds Susan's Appointments and texts her a Reminder before each. " +
  `You act for ${by.person.name}: every change you make is recorded as ${by.person.name}'s, ` +
  'via agent, and the other Admins are told of it. Changes follow the same rules as in the app, ' +
  'and a change the calendar will not make is refused with words that say why. ' +
  `All dates and times are Susan's local time (${timeZone}). ` +
  'Start with list_appointments, which also gives today’s date. An Appointment in a Series can ' +
  'be changed on its own (change_appointment) or with all later ones (change_series).';

// What tools take. Each is checked again by the core, which refuses in words for a person.
const date = z.string().describe("A date, YYYY-MM-DD, in Susan's local time.");
const time = z.string().describe("A time, 24-hour HH:MM, in Susan's local time.");
const words = (what: string) =>
  z.string().nullable().optional().describe(`${what} Null or empty clears it.`);
const appointmentId = z.string().describe("The Appointment's ID, from list_appointments.");

const reminder = z
  .object({
    id: z
      .string()
      .optional()
      .describe(
        'The ID of a Reminder the Appointment already has, to keep or change it. Leave it out for a new one.',
      ),
    shape: z
      .enum(REMINDER_SHAPES)
      .describe(
        '"before": a gap before the start (amount and unit). "daysBefore": a number of days before at a clock time (days, 0 for the same day, and time). "at": an exact date and time.',
      ),
    amount: z.number().int().optional().describe('For "before": how many units before.'),
    unit: z.enum(REMINDER_UNITS).optional().describe('For "before".'),
    days: z.number().int().optional().describe('For "daysBefore".'),
    date: date.optional().describe('For "at".'),
    time: time.optional().describe('For "daysBefore" and "at".'),
    reviewed: z
      .boolean()
      .optional()
      .describe(
        'True to confirm, as it is, a Reminder flagged needsReview because its Appointment moved.',
      ),
  })
  .describe('A Reminder: a text to Susan before the Appointment.');

const reminders = z
  .array(reminder)
  .optional()
  .describe(
    'The whole list of Reminders: any left out are removed, and [] means none. To keep one, include it with its id. Left out entirely, the Reminders stay as they are; a new Appointment then starts with one, the day before at 6:00 pm. Each must go out before the Appointment starts.',
  );

const details = {
  withWhom: words('Who it is with.'),
  placeName: words("The place's name."),
  placeAddress: words("The place's address."),
  driverName: words('The Driver taking Susan, by name.'),
  pickupTime: time.nullable().optional().describe('When the Driver picks Susan up, HH:MM.'),
  noteForSusan: words('A Note for Susan, included in every Reminder text.'),
  privateNotes: words('Private notes, read in the calendar and never sent to Susan.'),
};

const repeat = z
  .object({
    every: z.enum(REPEAT_KINDS).describe('"week" or "month".'),
    interval: z
      .number()
      .int()
      .optional()
      .describe('Every how many weeks (up to 52) or months (up to 12). 1 if left out.'),
    weekdays: z
      .array(z.number().int())
      .optional()
      .describe('For "week": the weekdays, 0 for Monday to 6 for Sunday.'),
  })
  .describe(
    'How the Series repeats. A monthly one is on the day of the month of its first date, or the last day of a shorter month.',
  );
const ends = date
  .nullable()
  .optional()
  .describe('The last date the Series can have an Appointment on; null for no end.');

/** A tool: what an agent is told of it, and what it does. */
interface Tool<S extends z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  /** Whether it changes the calendar, and whether what it does takes something away. */
  changes?: 'adds' | 'takes away';
  run(args: z.infer<z.ZodObject<S>>, ctx: ToolContext): Promise<unknown>;
}

const tool = <S extends z.ZodRawShape>(each: Tool<S>) => each;

/** What was given, without what was left out: the core reads a detail left out as unchanged. */
const given = (args: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));

const TOOLS = [
  tool({
    name: 'list_appointments',
    title: 'List Appointments',
    description:
      'Lists Appointments in date order, with their details, Reminders and who added and last changed each. From today on unless told otherwise, and only active ones unless includeCancelled. Also gives today’s date.',
    inputSchema: {
      from: date.optional().describe('The first date to list. Today if left out.'),
      to: date.optional().describe('The last date to list. No end if left out.'),
      includeCancelled: z.boolean().optional().describe('Include cancelled Appointments.'),
    },
    async run({ from, to, includeCancelled }, { core, clock, timeZone }) {
      const day = today(timeZone, clock.now());
      const first = from ?? day;
      const listed = (await core.appointments()).filter(
        (each) =>
          each.date >= first &&
          (!to || each.date <= to) &&
          (includeCancelled || each.state === 'active'),
      );
      return {
        today: day,
        appointments: listed.map((each) => presentAppointment(each, timeZone)),
      };
    },
  }),
  tool({
    name: 'get_appointment',
    title: 'Read an Appointment',
    description:
      'Reads one Appointment in full: its details, its Reminders and when each goes out, its Series, and who added and last changed it.',
    inputSchema: { id: appointmentId },
    async run({ id }, { core, timeZone }) {
      return presentAppointment(await core.appointment(id), timeZone);
    },
  }),
  tool({
    name: 'list_texts',
    title: 'Texts about an Appointment',
    description:
      'Lists the texts sent to Susan about one Appointment, in the order they were due, with what became of each: Waiting, Sent, Delivered (her phone company accepted it for her phone, which is not to say she read it), Failed or Not sent, and why. A Reminder not yet due has no text yet.',
    inputSchema: { appointmentId },
    async run({ appointmentId: id }, { core, timeZone }) {
      return { texts: (await core.textsAbout(id)).map((each) => presentText(each, timeZone)) };
    },
  }),
  tool({
    name: 'list_series',
    title: 'List Series',
    description:
      'Lists every Series, ended ones too: Appointments that repeat on a pattern and were entered once, with the details and Reminders their Appointments start with. Each Appointment in a Series is also listed by list_appointments.',
    inputSchema: {},
    async run(_, { core, timeZone }) {
      return { series: (await core.everySeries()).map((each) => presentSeries(each, timeZone)) };
    },
  }),
  tool({
    name: 'get_series',
    title: 'Read a Series',
    description: 'Reads one Series in full, by its ID from list_series or an Appointment in it.',
    inputSchema: { id: z.string().describe("The Series' ID.") },
    async run({ id }, { core, timeZone }) {
      return presentSeries(await core.series(id), timeZone);
    },
  }),
  tool({
    name: 'add_appointment',
    title: 'Add an Appointment',
    description:
      'Adds an Appointment. It needs what it is, its date and its start time. With no reminders given it starts with one Reminder, the day before at 6:00 pm. Answers with the Appointment as added.',
    changes: 'adds',
    inputSchema: {
      id: z
        .string()
        .optional()
        .describe(
          'A new UUID for it, so that sending the same add again adds it once. Made for you if left out.',
        ),
      what: z.string().describe('What it is: "Eye exam".'),
      date,
      time: time.describe("When it starts, 24-hour HH:MM, in Susan's local time."),
      ...details,
      reminders,
    },
    async run({ id, ...sent }, { core, by, timeZone }) {
      const added = await core.addAppointment(by, given(sent) as never, id ?? crypto.randomUUID());
      return presentAppointment(added, timeZone);
    },
  }),
  tool({
    name: 'change_appointment',
    title: 'Change an Appointment',
    description:
      'Changes one Appointment: only the details given, the rest stay as they are. For one in a Series, this changes it on its own; use change_series for it and all later ones. Reminders, when given, are the whole new list. When it moves, Reminders set as a gap or days before follow it, and one at an exact time keeps its time and is flagged needsReview until confirmed or changed. Answers with the Appointment as it now is.',
    changes: 'adds',
    inputSchema: {
      id: appointmentId,
      what: z.string().optional().describe('What it is.'),
      date: date.optional(),
      time: time.optional().describe('When it starts, 24-hour HH:MM.'),
      ...details,
      reminders,
    },
    async run({ id, ...sent }, { core, by, timeZone }) {
      return presentAppointment(await core.changeAppointment(by, id, given(sent)), timeZone);
    },
  }),
  tool({
    name: 'cancel_appointment',
    title: 'Cancel an Appointment',
    description:
      'Cancels one Appointment: it stays in the calendar, marked cancelled, and its Reminders are not sent. For one in a Series, this cancels it on its own; use end_series for it and all later ones.',
    changes: 'takes away',
    inputSchema: { id: appointmentId },
    async run({ id }, { core, by, timeZone }) {
      return presentAppointment(await core.cancelAppointment(by, id), timeZone);
    },
  }),
  tool({
    name: 'delete_appointment',
    title: 'Delete an Appointment entered by mistake',
    description:
      'Deletes an Appointment entered by mistake, for good. Refused once any text about it may have reached Susan: cancel it instead, so that she is told.',
    changes: 'takes away',
    inputSchema: { id: appointmentId },
    async run({ id }, { core, by }) {
      await core.deleteAppointment(by, id);
      return { deleted: id };
    },
  }),
  tool({
    name: 'add_series',
    title: 'Add a Series',
    description:
      'Adds a Series: Appointments that repeat on a pattern, entered once. The date is its first Appointment, which must be a day the pattern gives. Its Appointments are made about six months ahead and kept topped up. Its Reminders can only be a gap before or days before (not "at"); with none given each starts with the day before at 6:00 pm. Answers with its first Appointment.',
    changes: 'adds',
    inputSchema: {
      id: z
        .string()
        .optional()
        .describe(
          'A new UUID for the Series, so that sending the same add again adds it once. Made for you if left out.',
        ),
      what: z.string().describe('What it is: "Dialysis".'),
      date: date.describe('Its first date, YYYY-MM-DD: a day the pattern gives.'),
      time: time.describe('When each starts, 24-hour HH:MM.'),
      ...details,
      reminders,
      repeat,
      ends,
    },
    async run({ id, ...sent }, { core, by, timeZone }) {
      const added = await core.addSeries(by, given(sent) as never, id ?? crypto.randomUUID());
      return presentAppointment(added.appointments[0], timeZone);
    },
  }),
  tool({
    name: 'change_series',
    title: 'Change a Series from one Appointment on',
    description:
      'Changes an Appointment in a Series and all later ones: the Series ends before it and goes on from it as a new Series with these changes. What is left out stays as the Series has it; later Appointments changed on their own are replaced too. Answers with this Appointment as it now is.',
    changes: 'adds',
    inputSchema: {
      id: appointmentId.describe('The ID of the first Appointment in the Series to change.'),
      what: z.string().optional().describe('What it is.'),
      date: date.optional().describe('Where the changed Series starts, YYYY-MM-DD.'),
      time: time.optional().describe('When each starts, 24-hour HH:MM.'),
      ...details,
      reminders,
      repeat: repeat.optional(),
      ends,
    },
    async run({ id, ...sent }, { core, by, timeZone }) {
      return presentAppointment(await core.changeSeries(by, id, given(sent) as never), timeZone);
    },
  }),
  tool({
    name: 'end_series',
    title: 'Cancel a Series from one Appointment on',
    description:
      'Cancels an Appointment in a Series and all later ones, keeping them in the calendar marked cancelled, and ends the Series before it. Answers with this Appointment as it now is.',
    changes: 'takes away',
    inputSchema: { id: appointmentId.describe('The ID of the first Appointment to cancel.') },
    async run({ id }, { core, by, timeZone }) {
      return presentAppointment(await core.endSeries(by, id), timeZone);
    },
  }),
];

const answer = (text: string, isError = false): CallToolResult => ({
  content: [{ type: 'text', text }],
  ...(isError ? { isError } : {}),
});

async function carryOut<S extends z.ZodRawShape>(
  each: Tool<S>,
  args: z.infer<z.ZodObject<S>>,
  ctx: ToolContext,
): Promise<CallToolResult> {
  try {
    return answer(JSON.stringify(await each.run(args, ctx)));
  } catch (error) {
    // A refusal is an answer, in words written for the person who asked.
    if (error instanceof CalendarRefusal) return answer(error.message, true);
    // Fixed words only: the error could quote the Appointment.
    logFailure(`MCP tool ${each.name}`, error);
    return answer(TOOL_FAILED, true);
  }
}

export function createMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: instructions(ctx.by, ctx.timeZone) });
  for (const each of TOOLS as Tool<z.ZodRawShape>[])
    server.registerTool(
      each.name,
      {
        title: each.title,
        description: each.description + aboutTimeAndTexts(ctx.timeZone),
        inputSchema: each.inputSchema,
        annotations: {
          readOnlyHint: !each.changes,
          destructiveHint: each.changes === 'takes away',
          idempotentHint: !each.changes,
          openWorldHint: false,
        },
      },
      // The library has checked the arguments against inputSchema.
      ((args: Record<string, unknown>) => carryOut(each, args as never, ctx)) as never,
    );
  return server;
}
