// The calendar core, as the rest of the code sees it. Import from here, not from the files beside
// this one.

export * from './appointment';
export { calendarFeed, FEED_NAME } from './feed';
export {
  isSubscriptionSecret,
  subscriptionAddress,
  type MadeSubscriptionLink,
  type SubscriptionLink,
} from './subscription';
export { CalendarRefusal, createCalendarCore } from './core';
export type {
  CalendarCore,
  CalendarCoreOptions,
  RefusalField,
  RefusalReason,
  SettingName,
  SettingsChanges,
} from './core';
export * from './reminders';
export * from './texts';
export {
  createFixedClock,
  createMemoryMessenger,
  createMemoryStore,
  createStandInSender,
} from './memory';
export type {
  FixedClock,
  MemoryMessenger,
  MemoryStore,
  StandInSender,
  StandInText,
} from './memory';
export { NO_ADMIN_MESSENGER, NO_TEXT_SENDER, systemClock } from './ports';
export type {
  AdminMessenger,
  AppNotification,
  Clock,
  SendResult,
  Store,
  TextSender,
} from './ports';
export * from './series';
