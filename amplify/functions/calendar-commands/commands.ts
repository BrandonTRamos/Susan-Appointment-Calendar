// The calendar core's commands as the data API calls them: one mutation each
// (amplify/data/resource.ts). This works out who is asking and hands the command to the core.

import { CalendarRefusal, type Actor, type CalendarCore } from '../../../src/lib/calendar';
import { COMMAND_FAILED, type CommandAnswer } from '../../../src/lib/calendarApi';
import { logFailure } from '../../calendar/log';
import type { FindName } from '../../calendar/people';
import type { TextSenderName } from '../../calendar/text-sender';

/** What the data API hands a function for one mutation, or for the textSender query. */
export interface CommandEvent {
  /** Amplify Gen 2 puts the mutation's name here; AppSync's own events put it under `info`. */
  fieldName?: string;
  info?: { fieldName?: string };
  arguments: Record<string, unknown>;
  /** Who is signed in, as the data API checked it. */
  identity?: unknown;
}

export interface CommandDependencies {
  core: () => Promise<CalendarCore>;
  nameOf: FindName;
  /** Which text sender is in use (amplify/calendar/text-sender.ts). */
  textSender: () => TextSenderName;
}

/** The commands, as the data API names them: the only names a log may repeat. */
const COMMANDS = new Set([
  'addAppointment',
  'changeAppointment',
  'cancelAppointment',
  'removeAppointment',
  'makeSubscriptionLink',
  'switchOffSubscriptionLink',
  'changeSettings',
  'sendTestText',
]);

/** Shown when the account has no usable name. The owner gives every account one. */
const NO_NAME = 'Someone';

/** The signed-in person, from the identity the data API checked. Nothing the caller sent is used. */
async function actor(identity: unknown, nameOf: FindName): Promise<Actor> {
  const { sub, username } = (identity ?? {}) as { sub?: unknown; username?: unknown };
  if (typeof sub !== 'string' || !sub || typeof username !== 'string' || !username)
    throw new Error('No signed-in person came with the command.');
  const name = (await nameOf(username))?.trim().replace(/\s+/g, ' ').slice(0, 80);
  // A command from the app is the person's own act. Agents come in through the MCP server.
  return { person: { id: sub, name: name || NO_NAME }, viaAgent: false };
}

/** Details arrive as JSON text. Anything else is left for the core to refuse. */
function fromJson(sent: unknown): unknown {
  if (typeof sent !== 'string') return sent;
  try {
    return JSON.parse(sent);
  } catch {
    return sent;
  }
}

export function calendarCommandHandler({ core, nameOf, textSender }: CommandDependencies) {
  return async (event: CommandEvent): Promise<CommandAnswer | TextSenderName> => {
    const command = event.fieldName ?? event.info?.fieldName;
    // Not a command: it changes nothing, and says nothing about the calendar.
    if (command === 'textSender') return textSender();
    const { id, details, changes, settings } = event.arguments;
    try {
      const by = await actor(event.identity, nameOf);
      const calendar = await core();
      switch (command) {
        case 'addAppointment':
          return {
            appointment: await calendar.addAppointment(
              by,
              fromJson(details) as never,
              id as string | null | undefined,
            ),
          };
        case 'changeAppointment':
          return {
            appointment: await calendar.changeAppointment(
              by,
              id as string,
              fromJson(changes) as never,
            ),
          };
        case 'cancelAppointment':
          return { appointment: await calendar.cancelAppointment(by, id as string) };
        case 'removeAppointment':
          await calendar.deleteAppointment(by, id as string);
          return { appointment: null };
        // A Series answers with its first Appointment; the rest reach the app as live updates.
        case 'addSeries': {
          const added = await calendar.addSeries(
            by,
            fromJson(details) as never,
            id as string | null | undefined,
          );
          return { appointment: added.appointments[0] };
        }
        case 'changeSeries':
          return {
            appointment: await calendar.changeSeries(by, id as string, fromJson(changes) as never),
          };
        case 'endSeries':
          return { appointment: await calendar.endSeries(by, id as string) };
        case 'makeSubscriptionLink':
          return { subscriptionLink: await calendar.makeSubscriptionLink(by) };
        case 'switchOffSubscriptionLink':
          await calendar.switchOffSubscriptionLink(by);
          return { subscriptionLink: null };
        case 'changeSettings':
          return { settings: await calendar.changeSettings(by, fromJson(settings) as never) };
        case 'sendTestText':
          return { text: await calendar.sendTestText(by) };
        default:
          throw new Error(`Unknown calendar command: ${String(command)}`);
      }
    } catch (error) {
      // A refusal is an answer: its words are for the person who asked.
      if (error instanceof CalendarRefusal) {
        const { reason, message, detail } = error;
        return { refusal: { reason, message, detail } };
      }
      // Fixed words only: which command, from the list, and the kind of failure. The error can
      // quote the Appointment, a link, Susan's number or a text, so neither it nor its cause goes
      // on: the data API is handed a fresh error that says only to try again.
      logFailure(
        `Calendar command ${COMMANDS.has(String(command)) ? command : '(unknown)'}`,
        error,
      );
      // eslint-disable-next-line preserve-caught-error -- the cause could quote a number or a text
      throw new Error(COMMAND_FAILED);
    }
  };
}
