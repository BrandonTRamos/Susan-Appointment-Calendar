// How Susan agrees to be texted: the words read aloud to her, and the one text that confirms her
// answer. The public About page shows both, and the same words are in the setup document the
// owner reads from (docs/text-message-setup.md). Change them in both places together;
// src/lib/consent.test.ts fails if they differ.

/**
 * The consent script. `site` is the app's address without "https://", such as "example.com".
 * `ask` is read aloud, ending in the question; `afterYes` is said once she has agreed.
 */
export function consentScript(site: string): { ask: string[]; afterYes: string } {
  return {
    ask: [
      "Susan, I have set up a service called Susan's Calendar. It sends text messages to your mobile phone to remind you about your appointments: what each one is, when and where it is, and who is driving you. It also texts you if an appointment you were reminded about is moved or cancelled.",
      'How many texts you get depends on how many appointments you have. It is usually between 2 and 10 a week. Message and data rates may apply.',
      'You can reply HELP to any of the texts to get help, and you can reply STOP at any time to stop them.',
      `The terms are at ${site}/terms and the privacy policy is at ${site}/privacy. Your mobile number is used only to send you these texts.`,
      "Do you agree to get these text reminders from Susan's Calendar on your mobile phone? Please answer yes or no.",
    ],
    afterYes: 'Thank you. You will get one text message now to confirm it.',
  };
}

/**
 * The first text Susan gets, sent once after she agrees. It is the only text that carries the
 * opt-out wording: Textbelt wants it in the first text to a person, and adds its own if it is missing.
 */
export const CONSENT_CONFIRMATION =
  "Susan's Calendar: You agreed to get text reminders about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help. Reply STOP to unsubscribe.";
