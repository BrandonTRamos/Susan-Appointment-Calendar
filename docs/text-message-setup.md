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

A text sent this way names no address for replies, so anything she answers to it goes nowhere. Every text the app sends names its reply address (ticket 17), so what she answers to those reaches the Admins. STOP still works either way: Textbelt handles it.

## What Textbelt's documentation says

Checked on 19 November 2026, and again on 20 November 2026 for the send and status requests and their answers (ticket 13). The calendar's Textbelt sender (`amplify/calendar/textbelt.ts`) is built and tested against the answers recorded here; nothing in its tests reaches Textbelt.

- **Who may send.** No registration and no business details. The terms ask three things: recipients "must have explicitly opted into receiving your messages" and "You are expected to retain opt-in records" (the owner holds Susan's agreement; no record is kept in the app or in this repository); "Indicate your name or business in your SMS"; and "If you are sending recurring SMS, provide opt-out instructions."
- **Opt-out wording goes in the first text.** Textbelt adds "Reply STOP to unsubscribe" itself "the first time you message a new user", unless the word STOP is already in the text. The Confirmation text carries it, so nothing is added. The documentation does not say that later texts must repeat it, so Reminders and Change notices stay as the spec words them.
- **The sender's name** must appear in the conversation. Every text opens "Susan's Calendar:".
- **STOP and START.** "We automatically process STOP responses." To undo it, "the recipient must send 'START' in reply", and nobody else can do it for her.
- **Replies** are sent to a web address named in each outgoing text (`replyWebhookUrl`), for US numbers, on any key but the free `textbelt` one. Each carries the reply's words and her number, with a signature made from the key and a timestamp that should be no more than 15 minutes old.
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
- **Replies (built in ticket 17; read again on 20 November 2026).** "U.S. phone numbers only", and not on the free `textbelt` key. Textbelt sends "an HTTP POST request" to the `replyWebhookUrl` named in the send, `application/json`, holding `textId` ("The ID of the original text that began the conversation"), `fromNumber` and `text`, and `data` when the send carried `webhookData` (at most 100 characters; the calendar sends none). `X-textbelt-signature` is the hex HMAC-SHA256, keyed with the key, of `X-textbelt-timestamp` (UNIX seconds) followed by the raw body, with nothing between; "You should ensure that this timestamp is not more than 15 minutes out of date." The calendar's reply address (`amplify/functions/text-replies`, checked in `amplify/calendar/textbelt.ts`) takes only such a request, compares the signature in constant time, and refuses one whose timestamp is more than 15 minutes either side of now. Not documented: how long after a send a Reply is still passed on, which HTTP status the reply address should answer, how long Textbelt waits for it, and whether it tries again. The reply address refuses a signed body without a usable `textId`, `fromNumber` or `text`; answers 200 once the Reply is kept, and the same to one from a number that is not Susan's in Settings, which it keeps nowhere; and 503 when it could not be kept. The same request arriving again is kept once.
- **STOP and HELP (ticket 17).** The documentation says "We automatically handle STOP replies", that "To opt back in, the recipient must send "START" in reply" and "Only the original recipient can opt-in". It does not say whether a STOP, START or HELP reply is also passed to the reply address, what a send to a number that has opted out returns, or whether HELP is answered by Textbelt. None has been tried: the owner deferred the check for this release (20 November 2026), and it is not a condition of shipping Replies. Until it is run, below, the calendar takes nothing for granted: any of the three that reaches the reply address is a Reply like any other, passed on and answered, and a refused send is an ordinary refusal unless its `error` words are listed in `TEXTBELT_OPTED_OUT_ERRORS` in `amplify/calendar/textbelt.ts`, which is empty. If HELP reaches the reply address like any other word, the calendar's automatic answer, which names who to call, is the help.

### Checking Replies after a deploy (ticket 17)

The one live check for this release, done by the owner on the deployed app with the owner's own phone, which Settings hold in Susan's place until go-live. It needs the key stored (README, "The Textbelt key"), and spends about two credits. Record nothing from it in the project.

1. Open **Settings → Susan's phone and contact**, with the owner's number and the contact name and number already there, and press **Save** once, changing nothing.
2. Press **Send a test text**. When it arrives, reply once with a few ordinary words (not STOP, START or HELP).
3. Within a minute: the Reply shows in the Replies tab, counted as not seen; every Admin is told by email and app notification, quoting it; and the phone gets the automatic answer, naming the contact person and number from Settings.

Settings saved before ticket 17 need that one save before Replies get an automatic answer; a Reply that comes before it is still passed on, with no answer.

### Checking STOP and HELP (deferred by the owner)

Deferred by the owner on 20 November 2026: not part of this release, and not required before any pull request or deploy. Until it is run, keyword forwarding and the answer to a send to a number that opted out stay unverified, `TEXTBELT_OPTED_OUT_ERRORS` stays empty, and nothing is guessed. When the owner chooses to run it: only the owner, with the owner's own phone, on a personal sandbox or before go-live. Never with Susan's phone: replying STOP blocks texts to the phone that sends it until it replies START. It spends about six credits.

What goes into the project from it is only the shape of what Textbelt answered, with every value that could identify anyone taken out: `success`, the `error` words of a refusal, whether a `textId` or `quotaRemaining` came (not their values), a status word, and yes or no for each question below. Never the key, any phone number, a `textId`, a credit balance, the words of any reply sent from the phone, or the words of any text Textbelt sends back.

Before starting, on a sandbox:

1. `npm run sandbox` (README, "Run it against a sandbox backend") with AWS credentials, and `npx ampx sandbox secret set TEXTBELT_KEY` with the key. The sandbox has its own reply address; every text it sends names it.
2. Create an Admin account in the sandbox's user pool (README, "Accounts"), then `npm run dev` and sign in. Turn on app notifications on a device; for Alert emails, set `ALERT_EMAIL_FROM` and verify the addresses (README, "Alert emails"), or check app notifications only.
3. In **Settings → Susan's phone and contact**, enter the owner's own mobile number in Susan's place, and a contact name and number, and save. On a fresh sandbox this gives the number its destination ID.

Then:

1. **A Reply arrives.** Press **Send a test text**. When it arrives, reply with any short words. Within a minute: the Replies tab shows it and counts it as not seen; every Admin is told, quoting it; the phone gets the automatic answer, naming the contact. Reply again: it is passed on, and no second automatic answer comes (the Replies tab says so).
2. **HELP.** Reply `HELP`. Note yes or no: did Textbelt itself text back? Did `HELP` show in the Replies tab?
3. **STOP.** Reply `STOP`. Note yes or no: did Textbelt text back to confirm? Did `STOP` show in the Replies tab?
4. **A send after STOP.** Press **Send a test text**, and note its status in Settings and whether an Alert came. Then see Textbelt's own answer, which the app does not keep. In a terminal, so that neither the key nor the number lands in the shell's history:

   ```bash
   read -rs TEXTBELT_KEY && read -r PHONE   # paste the key, then type the ten digits
   curl -s -X POST https://textbelt.com/text \
     --data-urlencode phone="$PHONE" \
     --data-urlencode message="Susan's Calendar: Checking a send after STOP." \
     --data-urlencode key="$TEXTBELT_KEY"
   ```

   Note its shape only: `success`, the `error` words if any, and whether `textId` and `quotaRemaining` are present. If a `textId` came, run `curl -s https://textbelt.com/status/` followed by it a few minutes later and note the status word.

5. **START.** Reply `START`. Note yes or no: did Textbelt text back to confirm? Did `START` show in the Replies tab? Press **Send a test text** and check that it arrives and its status reaches Delivered. If it does not, ask Textbelt's support to lift the block before going on.

Then record the sanitized findings: the answers to 2 to 5 go in the spec's "Further Notes", in place of the "to confirm" items they settle, and here, in place of "It does not say" above. If the send in step 4 was refused with `success: false`, its exact `error` words go in `TEXTBELT_OPTED_OUT_ERRORS` in `amplify/calendar/textbelt.ts`, with a test using that shape, so that such a send raises the "texts are blocked" Alert and banner instead of an ordinary failure. If STOP reached the reply address, nothing else changes: the calendar never reads a Reply for meaning, and the Admins read it. That settles the STOP and HELP item ticket 17 deferred. Delete the sandbox afterwards (`npx ampx sandbox delete`).

### Sources

- Textbelt documentation: `https://docs.textbelt.com/`
- Textbelt terms: `https://textbelt.com/tos/`
- The research behind the choice of Textbelt: `docs/research/text-message-options.md`
