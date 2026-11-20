---
status: accepted
---

# Text messages are sent through Textbelt

Reminders, Change notices and every other text to Susan are sent through Textbelt, a prepaid service that sends from its own numbers and asks its customer to register nothing. We chose it on 19 November 2026 because no provider will register a number for this use: US carriers require a sending number to be registered, and since 15 September 2026 the registration rules refuse "reminders to yourself, friends, or family members" (Twilio's error 30532, and the industry-wide toll-free code 1114). This supersedes ADR 0001, whose premise, that Twilio's Sole Proprietor registration is open to a private individual for this use, no longer holds.

A trial the same day settled it. Two texts to the owner's iPhone arrived as ordinary text messages from one number, Textbelt reported the first as `DELIVERED`, and a reply came back to a web address within seconds, signed.

The research behind this is `docs/research/text-message-options.md`.

## Considered options

- **A number registered in the owner's name, with any provider.** Ruled out. Twilio and AWS refuse personal use in writing; toll-free numbers refuse it at every provider; the rest require a business or an EIN. Vonage and Telnyx accept an individual with no EIN and say nothing about texting family, so an application there would cost about $20 and some weeks with no documented chance of approval. An EIN would not help: the refusal is about what the texts are for.
- **An Android phone on its own mobile line, driven by an open-source gateway app.** The strongest route on paper: one fixed number the family owns, delivery reports, Replies, and nobody's approval. Not chosen now because it needs a phone bought for the job, a monthly line ($5 to $35), and a device kept running in someone's home, and because no carrier's consumer terms grant permission for software-sent texts. It is the fallback if Textbelt fails in one of the ways listed under Consequences.
- **A Mac sending iMessages, or an iPhone running a Shortcuts automation.** Rejected: neither is supported by Apple for this, both fail silently in documented ways, and an iMessage would arrive inside an Admin's own conversation with Susan.
- **Something other than a text** (an automated call, an app notification, a calendar alert). Rejected as the main channel: the spec is built on Susan noticing and reading ordinary texts.

## Consequences

- **No registration and no review.** The owner's ticket to register a number falls away. The Public pages are no longer required by any reviewer; they stay as a plain account of what the calendar texts and what it does with Susan's number, and the consent script still points to them.
- **Consent still matters.** Textbelt's terms require that the recipient has opted in and that the sender keeps a record. Susan is still asked in person with the consent script and sent the Confirmation text.
- **The sending number is Textbelt's, not ours.** Texts come from a shared pool, and Textbelt keeps to one number for a recipient only "whenever possible". If the number changes, Susan sees a text from a number that is not in her contacts, and the calendar has no way to know. This is the main known weakness.
- **How Textbelt's numbers are registered with carriers is not disclosed.** Whether a Reminder falls inside that arrangement cannot be checked from outside, so a carrier could begin filtering these texts without notice. The delivery status and the "not confirmed delivered" Alert are what would show it.
- **Delivery status is asked for, not pushed.** The app asks Textbelt for each text's status until it is settled. Some carriers never report delivery, in which case the status stays at "sent". Statuses are kept by Textbelt for one week.
- **STOP is handled by Textbelt.** It blocks further texts to Susan when she replies STOP, and only she can lift the block, by replying START.
- **Texts must not contain web addresses** unless Textbelt has enabled that for the key.
- **Credit is prepaid** and can run out. The app has to warn Admins before it does. Credit lapses after 365 days with no texts sent.
- **Textbelt sees Susan's number and the words of every text.** It says numbers are never shared or sold and that its logs are wiped after 60 days. The privacy policy names it.
- **Cost falls** to about $5 to $15 a year, with nothing owed monthly, against about $20 once and $4 to $5 a month under ADR 0001.
- **Textbelt is a small company** and says its service is "not reliable enough" for anything affecting safety. Reminders are a help, not a guarantee, which the terms already say.
- **The single seam stays.** The text sender remains one narrow port with Textbelt behind it, so moving to the Android phone route, or to a registered number if the rules change, touches one adapter.
