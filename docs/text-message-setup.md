# Setting up text messages

Everything the owner needs to do by hand so that the calendar can text Susan: get a Textbelt key and send her the Confirmation text. It follows ADR 0002 (`docs/adr/0002-textbelt-for-text-messages.md`), and it is what ticket 05 works through.

Textbelt sends from its own numbers, so there is nothing to register and nobody reviews anything. Susan has already agreed to be texted, so there is no script to read and nothing to record. What remains is the key and her first text.

Never write Susan's surname, her phone number or the Textbelt key in this repository. It is public.

## What it costs

Prices on 19 November 2026. Credit is bought in advance; nothing is owed monthly.

| Credit      | Price |
| ----------- | ----- |
| 50 texts    | $3    |
| 200 texts   | $5    |
| 700 texts   | $10   |
| 1,700 texts | $23   |

- One credit is one segment of 160 plain characters. A Reminder with a place, a Driver and a Note for Susan is usually two.
- **Each year: about $5 to $15**, for 10 to 40 texts a month.
- A text that fails still uses its credit.
- Credit lapses if a whole year passes with no text sent. That cannot happen while Reminders are going out.
- Textbelt will top the key up automatically if asked. It needs a card, not PayPal, and an email to its support address.

## Step 1: The Textbelt key

- [ ] Buy credit at `https://textbelt.com/purchase/`. The key that comes back is the only credential. A key was bought on 19 November 2026 for the trial recorded in ADR 0002; it can be topped up and used for the real thing.
- [ ] Keep the key somewhere private. It is stored as the app's deployment secret `TEXTBELT_KEY` (README, "The Textbelt key"): first to try real texts on the owner's own phone, and for good at go-live (ticket 18).
- [ ] Open `https://textbelt.com/account?key=` followed by the key, and set the sender name to `Susan's Calendar`. Every text already opens with that name; setting it stops Textbelt adding a name of its own to a first text.

## Step 2: The Confirmation text

Send this once. It must be the first text she gets from Textbelt, because it is the one that tells her how to stop the texts. Send it on the day the app goes live (ticket 18), not before: until then real texts go only to the owner's own phone. Tell her to expect it. To change a word, change `src/lib/consent.ts` and this document together; a test fails if they differ.

```text
Susan's Calendar: You agreed to get text reminders about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help. Reply STOP to unsubscribe.
```

Until the app can send it, send it from a terminal. Put her ten-digit mobile number in place of `SUSANS_NUMBER` and the key in place of `YOUR_KEY`:

```bash
curl -X POST https://textbelt.com/text \
  --data-urlencode phone='SUSANS_NUMBER' \
  --data-urlencode message="Susan's Calendar: You agreed to get text reminders about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help. Reply STOP to unsubscribe." \
  -d key=YOUR_KEY
```

The answer holds a `textId`. Ask what happened to the text:

```bash
curl https://textbelt.com/status/TEXT_ID
```

- [ ] The status is `DELIVERED`, and the text is on her phone. This is also the first proof that her carrier accepts Textbelt's texts.
- [ ] The number it came from is saved in her contacts as "Susan's Calendar", so that later texts arrive under a name she knows.

A text sent this way names no address for replies, so anything she answers before ticket 17 is live goes nowhere. STOP still works: Textbelt handles it.

## What Textbelt's documentation says

Checked on 19 November 2026, and again on 20 November 2026 for the send and status requests and their answers (ticket 13). The calendar's Textbelt sender (`amplify/calendar/textbelt.ts`) is built and tested against the answers recorded here; nothing in its tests reaches Textbelt.

- **Who may send.** No registration and no business details. The terms ask three things: recipients "must have explicitly opted into receiving your messages" and "You are expected to retain opt-in records" (the owner holds Susan's agreement; no record is kept in the app or in this repository); "Indicate your name or business in your SMS"; and "If you are sending recurring SMS, provide opt-out instructions."
- **Opt-out wording goes in the first text.** Textbelt adds "Reply STOP to unsubscribe" itself "the first time you message a new user", unless the word STOP is already in the text. The Confirmation text carries it, so nothing is added. The documentation does not say that later texts must repeat it, so Reminders and Change notices stay as the spec words them.
- **The sender's name** must appear in the conversation. Every text opens "Susan's Calendar:".
- **STOP and START.** "We automatically process STOP responses." To undo it, "the recipient must send 'START' in reply", and nobody else can do it for her.
- **Replies** are sent to a web address named in each outgoing text (`replyWebhookUrl`), for US numbers, on a paid key. Each carries the reply's words and her number, with a signature made from the key and a timestamp that should be no more than 15 minutes old.
- **Delivery status** is asked for by `textId`, with no key: `GET https://textbelt.com/status/TEXT_ID` answers `{"status": "DELIVERED"}`. The statuses are `DELIVERED` ("Carrier has confirmed sending"), `SENT` ("Sent to carrier but confirmation receipt not available"), `SENDING` ("Queued or dispatched to carrier"), `FAILED` ("Not received") and `UNKNOWN` ("Could not determine status"); the documentation says "Possible return values include" them, so others may exist. Textbelt warns that "Delivery statuses are not standardized between mobile carriers" and that "Some carriers do not have a way of tracking delivery, so all their messages will be marked 'SENT'". A status can be asked for up to a week after sending. What an unknown `textId` returns is not documented.
- **The sending number.** "Textbelt SMS are sent from a very large shared pool of phone numbers. Whenever possible, our service makes sure that you are represented to your recipients as a single unique phone number."
- **Web addresses in a text** need permission first: "Due to abuse, sending text messages containing URLs requires whitelist permissions", given by Textbelt's support or at `https://textbelt.com/whitelist?key=` followed by the key. Shortened links are refused outright. What a send holding one returns without permission is not documented. No text the calendar sends holds one: it checks the words of every text before sending and records one that holds an address as not sent, and a Reminder's preview warns of it.
- **Credit** is used per segment, and a text that fails still uses it. Credit bought after April 2017 lapses "if 365 days go by without any usage on your key". The credit left can also be read at `https://textbelt.com/quota/` followed by the key, which answers `{"success": true, "quotaRemaining": 98}`.
- **Pace.** "You shouldn't send more than 1 text per second" (1 to 2 in another page); one request sends one text. The calendar sends one text at a time, each after the last has been answered. Asking for statuses is not sending: the scheduled run asks about up to four texts at once, after its sends.
- **Privacy.** "Under no circumstances are your phone numbers shared or sold." Numbers and message words may be kept in logs, and "After 60 days, records are wiped permanently."
- **Reliability.** Textbelt publishes no delivery figures and says the service is "not reliable enough" for anything affecting safety.

### For later tickets

- **Sending (built in ticket 13).** One form-encoded `POST` to `https://textbelt.com/text` with `phone` (ten digits for a US number), `message` and `key`; `sender`, `replyWebhookUrl` and `webhookData` are optional. A text that went answers `{"success": true, "quotaRemaining": 40, "textId": 12345}`; `textId` is "Only present when success=true". One refused answers `{"success": false, "quotaRemaining": 0, "error": "Out of quota"}`, and one missing a field `{"success": false, "error": "Incomplete request"}`, with no `quotaRemaining`. No HTTP status codes are documented: the calendar reads `success`, and takes anything else, such as a server error or an answer that is not JSON, as not knowing whether the text went. Adding `_test` to the key checks a request without sending or spending anything; no sample answer is documented.
- **Long texts.** A text of up to 160 plain characters is one segment (70 if it holds a character outside the basic set), and a longer one "is delivered to the recipient as multiple texts". Whether a two-segment Reminder shows on Susan's iPhone as one message or two has to be seen on a real phone.
- **Replies (ticket 17).** The signature is an HMAC-SHA256 of the timestamp followed by the raw body, keyed with the Textbelt key, in the `X-textbelt-signature` header; the timestamp is in `X-textbelt-timestamp`.
- **STOP and HELP (ticket 17).** The documentation does not say whether a STOP reply is also passed to the reply address, what a send to a number that has opted out returns, or whether HELP is answered by Textbelt. Each has to be tried. If HELP reaches the reply address like any other word, the calendar's automatic answer, which names who to call, is the help.

### Sources

- Textbelt documentation: `https://docs.textbelt.com/`
- Textbelt terms: `https://textbelt.com/tos/`
- The research behind the choice of Textbelt: `docs/research/text-message-options.md`
