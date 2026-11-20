// The calendar core's commands as the data API calls them: one mutation each
// (amplify/data/resource.ts). This works out who is asking and hands the command to the core.

import { CalendarRefusal, type Actor, type CalendarCore } from '../../../src/lib/calendar';
import { COMMAND_FAILED, type CommandAnswer } from '../../../src/lib/calendarApi';
import type { FindName } from '../../calendar/people';

/** What the data API hands a function for one mutation. */
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
}

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

export function calendarCommandHandler({ core, nameOf }: CommandDependencies) {
  return async (event: CommandEvent): Promise<CommandAnswer> => {
    const command = event.fieldName ?? event.info?.fieldName;
    const { id, details, changes } = event.arguments;
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
        default:
          throw new Error(`Unknown calendar command: ${String(command)}`);
      }
    } catch (error) {
      // A refusal is an answer: its words are for the person who asked.
      if (error instanceof CalendarRefusal) {
        const { reason, message, detail } = error;
        return { refusal: { reason, message, detail } };
      }
      // What broke and where, and nothing about the Appointment or a link.
      const e = error instanceof Error ? error : null;
      console.error(
        'Calendar command failed',
        String(command),
        e?.name ?? 'Unknown error',
        e?.message.slice(0, 300) ?? '',
        e?.stack?.split('\n').slice(1, 6).join(' | ') ?? '',
      );
      throw new Error(COMMAND_FAILED, { cause: error });
    }
  };
}
