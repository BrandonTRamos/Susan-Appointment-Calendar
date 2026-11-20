// The calendar core, as the rest of the code sees it. Import from here, not from the files beside
// this one.

export * from './alerts';
export * from './appointment';
export {
  changeNoticeOwed,
  lastTold,
  MORNING,
  SETTLING_PERIOD,
  type ChangeNotice,
} from './changeNotices';
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
export { holdsWebAddress } from './webAddress';
export {
  createFixedClock,
  createMemoryMessenger,
  createMemoryStore,
  createStandInSender,
} from './memory';
export type {
  FixedClock,
  MemoryChannel,
  MemoryMessenger,
  MemoryStore,
  StandInSender,
  StandInText,
} from './memory';
export {
  DELIVERY_REPORTS,
  NO_ADMIN_MESSENGER,
  NO_DELIVERIES,
  NO_TEXT_SENDER,
  systemClock,
} from './ports';
export type {
  AdminEmail,
  AdminMessenger,
  AppNotification,
  Clock,
  Deliveries,
  DeliveryReport,
  SendResult,
  Store,
  TextSender,
} from './ports';
