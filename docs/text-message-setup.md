# Setting up text messages

Everything the owner needs to do by hand so that the calendar can text Susan: get a Textbelt key, ask Susan for her agreement, and send the Confirmation text. It follows ADR 0002 (`docs/adr/0002-textbelt-for-text-messages.md`), and it is what ticket 05 works through.

Textbelt sends from its own numbers, so there is nothing to register and nobody reviews anything. What remains is the key and Susan's consent.

Replace `[app address]` wherever it appears with the app's address without `https://`, as written in the README once ticket 03 is done.

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
- [ ] Keep the key somewhere private. Ticket 18 stores it as the app's deployment secret.
- [ ] Open `https://textbelt.com/account?key=` followed by the key, and set the sender name to `Susan's Calendar`. Every text already opens with that name; setting it stops Textbelt adding a name of its own to a first text.

## Step 2: Susan's consent

Read the script to Susan yourself, in person, and let her answer for herself. Do it on a day when you can send the Confirmation text straight afterwards: any time once the app is live at its address, or on the day of ticket 18.

### The consent script

Read it exactly. It is also shown on `https://[app address]/about`. To change a word, change `src/lib/consent.ts` and this document together; a test fails if they differ.

```text
Susan, I have set up a service called Susan's Calendar. It sends text messages to your mobile phone to remind you about your appointments: what each one is, when and where it is, and who is driving you. It also texts you if an appointment you were reminded about is moved or cancelled.

How many texts you get depends on how many appointments you have. It is usually between 2 and 10 a week. Message and data rates may apply.

You can reply HELP to any of the texts to get help, and you can reply STOP at any time to stop them.

The terms are at [app address]/terms and the privacy policy is at [app address]/privacy. Your mobile number is used only to send you these texts.

Do you agree to get these text reminders from Susan's Calendar on your mobile phone? Please answer yes or no.
```

If she says yes, say:

```text
Thank you. You will get one text message now to confirm it.
```

If she says no, or is unsure, send nothing and do not record a yes.

### The Confirmation text

Send this once, straight after she agrees. It must be the first text she gets from Textbelt, because it is the one that tells her how to stop the texts.

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

### The record of her consent

Textbelt's terms expect the sender to keep a record that the recipient agreed. **Do not commit it: this repository is public.** Copy the lines below into a note of your own, somewhere you will still have in a few years, and fill them in there. Tick the box on ticket 05 once it is done.

- Date she agreed: \_\_\_\_\_\_\_\_\_\_\_\_
- Time: \_\_\_\_\_\_\_\_\_\_\_\_
- How: in person, with the script above read to her in full by the owner
- Her answer: \_\_\_\_\_\_\_\_\_\_\_\_
- Confirmation text sent on: \_\_\_\_\_\_\_\_\_\_\_\_

## What Textbelt's documentation says

Checked on 19 November 2026.

- **Who may send.** No registration and no business details. The terms ask three things: recipients "must have explicitly opted into receiving your messages" and "You are expected to retain opt-in records"; "Indicate your name or business in your SMS"; and "If you are sending recurring SMS, provide opt-out instructions."
- **Opt-out wording goes in the first text.** Textbelt adds "Reply STOP to unsubscribe" itself "the first time you message a new user", unless the word STOP is already in the text. The Confirmation text carries it, so nothing is added. The documentation does not say that later texts must repeat it, so Reminders and Change notices stay as the spec words them.
- **The sender's name** must appear in the conversation. Every text opens "Susan's Calendar:".
- **STOP and START.** "We automatically process STOP responses." To undo it, "the recipient must send 'START' in reply", and nobody else can do it for her.
- **Replies** are sent to a web address named in each outgoing text (`replyWebhookUrl`), for US numbers, on a paid key. Each carries the reply's words and her number, with a signature made from the key and a timestamp that should be no more than 15 minutes old.
- **Delivery status** is asked for by `textId`: `DELIVERED`, `SENT`, `SENDING`, `FAILED` or `UNKNOWN`. Textbelt warns that "Some carriers do not have a way of tracking delivery, so all their messages will be marked 'SENT'". A status can be asked for up to a week after sending.
- **The sending number.** "Textbelt SMS are sent from a very large shared pool of phone numbers. Whenever possible, our service makes sure that you are represented to your recipients as a single unique phone number."
- **Web addresses in a text** need permission for the key first. No text the calendar sends holds one.
- **Privacy.** "Under no circumstances are your phone numbers shared or sold." Numbers and message words may be kept in logs, and "After 60 days, records are wiped permanently."
- **Reliability.** Textbelt publishes no delivery figures and says the service is "not reliable enough" for anything affecting safety.

### For later tickets

- **Sending (ticket 13).** One request to `https://textbelt.com/text` with `phone`, `message` and `key`. The answer gives `success`, a `textId`, the credit left (`quotaRemaining`) and, when it failed, an `error` such as "Out of quota". Adding `_test` to the key checks a request without sending or spending anything.
- **Long texts (ticket 13).** The documentation says a long text "is delivered to the recipient as multiple texts". Whether a two-segment Reminder shows on Susan's iPhone as one message or two has to be seen on a real phone.
- **Replies (ticket 17).** The signature is an HMAC-SHA256 of the timestamp followed by the raw body, keyed with the Textbelt key, in the `X-textbelt-signature` header; the timestamp is in `X-textbelt-timestamp`.
- **STOP and HELP (ticket 17).** The documentation does not say whether a STOP reply is also passed to the reply address, what a send to a number that has opted out returns, or whether HELP is answered by Textbelt. Each has to be tried. If HELP reaches the reply address like any other word, the calendar's automatic answer, which names who to call, is the help.

### Sources

- Textbelt documentation: `https://docs.textbelt.com/`
- Textbelt terms: `https://textbelt.com/tos/`
- The research behind the choice of Textbelt: `docs/research/text-message-options.md`
