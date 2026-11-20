// The one text that tells Susan she agreed to be texted and how to stop. She gave her consent to
// the owner herself, before the calendar sent her anything; nothing here asks for it. The public
// About page shows this text, and the setup document the owner sends it from
// (docs/text-message-setup.md) holds the same words. Change them in both places together;
// src/lib/consent.test.ts fails if they differ.

/**
 * The first text Susan gets, sent once. It is the only text that carries the opt-out wording:
 * Textbelt wants it in the first text to a person, and adds its own if it is missing.
 */
export const CONSENT_CONFIRMATION =
  "Susan's Calendar: You agreed to get text reminders about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help. Reply STOP to unsubscribe.";
