# Text message options for Susan's Calendar

Researched 19 November 2026, for the owner's decision. ADR 0001 (`docs/adr/0001-twilio-for-text-messages.md`) chose Twilio's Sole Proprietor registration. That route is closed, so the decision had to be made again. This document sets out every route found and what it recommended at the time.

**Outcome.** The owner had no Android phone to hand, so Textbelt was tried first, the same day. Two texts to the owner's iPhone arrived as ordinary texts from one number, the first was reported `DELIVERED`, and a reply came back to a web address, signed. The owner chose Textbelt, recorded in ADR 0002 (`docs/adr/0002-textbelt-for-text-messages.md`), with the Android phone route below as the fallback. The rest of this document is as written before that trial.

## The answer

- **No provider documents a registered number as open to this use.** Twilio and AWS refuse personal use in writing. Every other provider either requires a business or says nothing, and the few first-hand reports are refusals.
- **There are routes that work without anyone's approval.** The strongest is a spare Android phone on its own mobile line, running an open-source gateway app that the calendar drives over the internet. Susan gets an ordinary text from an ordinary number. The app learns sent and delivered, receives her Replies, and can tell when the phone has gone quiet.
- **That route has two honest weaknesses.** It depends on a phone staying on in someone's home, and no mobile carrier's consumer terms grant permission for software-sent texts (some forbid them; the choice of carrier matters).
- **A second route can be tested today for $3:** Textbelt, a paid service that needs no registration from its customer. It is weaker on reliability and the sending number may not stay the same.

## What was asked

The calendar must send Reminders and Change notices to one person, Susan, on her iPhone: about 10 to 40 texts a month, written by software and sent on a schedule. The owner is a private individual in the US with no business and no EIN. The research measured each route against four wants, in this order:

1. The text goes out unattended at the right time and arrives as an ordinary text.
2. The app can tell whether it was delivered.
3. Susan's Replies reach the app.
4. Low cost.

## How this was researched

Five passes, each against the rule-owner's or provider's own pages: the industry rules and Twilio; AWS and the other clouds; every other provider with an API; texts sent from a real phone or SIM; and channels other than a text. Their full notes, with a URL and an exact quote for every claim, are in `docs/research/text-message-options/`:

| Note                    | Covers                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `1-rules-and-twilio.md` | CTIA, The Campaign Registry, carrier codes of conduct, every Twilio sender type    |
| `2-aws-and-clouds.md`   | AWS End User Messaging, SNS, AWS voice, Amazon Connect, Azure, Google Cloud        |
| `3-other-providers.md`  | Telnyx, Vonage, Sinch, Plivo, Bandwidth and ten more; Textbelt; reminder services  |
| `4-phone-and-sim.md`    | Android gateway apps, carrier consumer terms, iPhone and Mac sending, modems, SIMs |
| `5-non-sms-channels.md` | Voice calls, web push, calendar alerts, WhatsApp, Telegram, email                  |

Each claim in the notes is marked CONFIRMED (read on the source that day), ANECDOTE (one person's report) or NOT FOUND. The claims this document's recommendation rests on were read a second time, directly from the source, and are marked **(re-read)** below. Everything else is as the notes report it.

Not reachable: Reddit (so no Reddit reports), The Campaign Registry's full policy (behind a login), and several provider support pages that refused automated reading. The notes list each one.

## Finding 1: a registered number is closed to this use

US carriers require any number that software sends from to be registered, either as a local number ("10DLC") or a toll-free number. Registration is where this use is refused.

| Route                                    | Open to the owner? | Evidence                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Twilio, Sole Proprietor 10DLC            | No                 | Error 30532, in force from 15 September 2026: "The number was requested to send reminders to yourself, friends, or family members." and "changing only the description does not make it eligible." **(re-read)**                                                                                                |
| Twilio, toll-free                        | No                 | The same page: "This error applies to both Toll-Free Verification and A2P 10DLC registration." **(re-read)**                                                                                                                                                                                                    |
| Toll-free at any provider                | No                 | Bandwidth lists the same rejection, code 1114, "Personal use cases are not allowed", effective the same day **(re-read)**. Sinch lists it too. The shared code points to one industry-wide list.                                                                                                                |
| AWS, 10DLC                               | No                 | "The campaign describes personal or peer-to-peer messaging, which is not permitted for A2P 10DLC." No Sole Proprietor brand is documented, and an EIN is required.                                                                                                                                              |
| AWS, toll-free as "Sole proprietor"      | Not documented     | The form waives the tax ID for a sole proprietor, but the only first-hand report (AWS re:Post, 9 October 2026) is a personal project denied three times, the last two for "Non Compliant Use Case".                                                                                                             |
| Telnyx, Sole Proprietor 10DLC            | Not documented     | Open with no EIN since February 2026, but requires "a single individual operating a business" and a website that "demonstrates your business's legitimacy". Silent on personal use.                                                                                                                             |
| Vonage, Sole Proprietor 10DLC            | Not documented     | The friendliest wording found: its examples are "Developer testing account, Single individual". Silent on messaging family. Its fee and step pages could not be read.                                                                                                                                           |
| Sinch, Sole Proprietor 10DLC             | Not known          | Exists; nothing current could be read.                                                                                                                                                                                                                                                                          |
| Plivo, Bandwidth, Bird, SignalWire, etc. | No                 | Each requires an EIN or has closed Sole Proprietor registration. Flowroute says in writing it "only allows messaging for business purposes".                                                                                                                                                                    |
| Brevo                                    | No                 | Sends to the US only from a registered toll-free number. Its form asks for a company website, a "government-issued business registration identifier" and a business email: "Personal or free email addresses are rejected for toll-free number registrations." Review takes "up to 4 to 6 weeks". **(re-read)** |
| Unregistered sending, any provider       | No                 | Blocked outright (Twilio error 30034; Telnyx: "will be blocked altogether").                                                                                                                                                                                                                                    |
| Short codes, RCS, WhatsApp, Verify       | No                 | Business only, or one-time passcodes only.                                                                                                                                                                                                                                                                      |
| Azure, Google Cloud                      | No                 | Azure stopped selling numbers to new customers on 23 October 2026. Google Cloud has no general SMS product.                                                                                                                                                                                                     |

**Who owns the rule.** For toll-free numbers the bar on personal use is industry-wide. For local numbers the only written bar found is each provider's own (Twilio, AWS, Flowroute). The Campaign Registry, which runs local-number registration, admits "a small business or individual" with no EIN and says nothing against personal use. So a Sole Proprietor registration at Vonage or Telnyx is not documented either way. It would cost about $20 and two or more weeks to find out, the application would have to say truthfully that there is no business, and no report of an approval for this use was found anywhere.

**Getting an EIN does not fix it.** The refusal is about what the messages are for, not who the sender is. The AWS report above was denied after an EIN was added.

**Twilio's guides still contradict its error page.** They describe the Sole Proprietor as open to a "hobbyist", in wording that dates from April 2023. The error page is the newer rule. Twilio's one remaining hobbyist example is a developer testing with themselves as the only recipient, which is a different case from Reminders to a family member.

## Finding 2: routes that need no registration

A text sent from an ordinary mobile line is treated as a person's own messaging, and nobody registers it. These are the ways software can send one.

### An Android phone as the sender (recommended)

A spare Android phone with its own SIM stays plugged in at an Admin's home. An open-source app on it accepts requests from the calendar over the internet and sends each as a real text from the phone's own number.

The project examined most closely is **SMS Gateway for Android** (`github.com/capcom6/android-sms-gateway`):

- **Maintained.** Apache-2.0 licence, about 6,000 stars, three releases in the eight days before this research, the latest on 19 November 2026. **(re-read)**
- **Sending.** The calendar calls an HTTPS API. The app can run through the project's free hosted relay, through a relay the owner hosts, or with a server on the phone itself. **(re-read)**
- **Delivery.** Signed webhooks report `sms:sent`, `sms:delivered` and `sms:failed`. Webhooks are signed with HMAC-SHA256 and retried for about two days. **(re-read)**
- **Replies.** An `sms:received` webhook carries each incoming text. **(re-read)**
- **Knowing the phone is alive.** A `system:ping` heartbeat webhook, and a `lastSeen` time on the device API.
- **Privacy.** With end-to-end encryption on, the message and Susan's number are encrypted before they reach the relay and decrypted on the phone. **(re-read)**
- **Cost.** The software and the hosted relay are free. The cost is the phone and its line.

Two other maintained projects have the same shape and could stand in: httpSMS (free up to 200 texts a month) and textbee (free up to 300).

What Susan sees: an ordinary green-bubble text from one number that never changes, which can be saved in her contacts under a name she knows.

**How it fails, and what guards against it:**

| Failure                                                         | Evidence                                                                                                                                                                                                  | Guard                                                                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| The phone goes quiet: app paused, Wi-Fi down, power cut, update | Every project says to keep the phone on a charger with battery saving off for the app. One user's incoming texts stopped after 17 days of uptime (August 2026); the maintainer fixed it within two weeks. | The calendar watches the heartbeat and raises an Alert to Admins when it stops, before a Reminder is missed where possible.  |
| "Delivered" stops arriving while texts still send               | Issue 486, opened 19 November 2026: after a phone update, a US T-Mobile user's delivery reports stopped decoding. Before that, about 99% of their texts had reported delivered. **(re-read)**             | Treat "sent" as the dependable signal and "delivered" as extra. The existing "not confirmed delivered" Alert covers the gap. |
| A Reply arrives by RCS and the app never sees it                | The app does not support RCS and recommends turning it off in Google Messages.                                                                                                                            | Turn RCS off on the gateway phone. This is an inference from the documentation, so test it with Susan's iPhone.              |
| The carrier objects to software-sent texts                      | See the carrier table below. No report of a line blocked at this volume was found.                                                                                                                        | Choose the line by its terms.                                                                                                |
| The line lapses                                                 | Prepaid lines expire when not renewed.                                                                                                                                                                    | Automatic payment.                                                                                                           |

**Carrier terms for the sending line.** No consumer agreement read grants permission for software-sent texts. They differ in what they forbid:

| Carrier                    | What its terms say                                                                                                                                                                                        | Cheapest plan found                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Verizon, Visible, Tracfone | Forbid only "spam" or "other abusive messaging or calling". Nothing on automated texts. **(re-read for Verizon and Visible)**                                                                             | Visible $25; Verizon Prepaid $30 to $35 |
| AT&T                       | Messaging is "solely for communication between, and/or initiated by, individuals for personal use". Forbids "unusually high numbers of messages or messages not originated on your Device". **(re-read)** | Prepaid prices could not be read        |
| T-Mobile, Tello            | Forbid "applications which are designed for unattended use" (in a list about network load) and "mass automated communications".                                                                           | Tello $5                                |
| Mint, US Mobile, Ultra     | Forbid "using the Service for automated text or picture messaging to another mobile device". An express ban.                                                                                              | Ultra $3 (not usable under its terms)   |

The carriers' own industry guidance (CTIA, May 2023) classes messaging by who sends it. An individual texting one family member is "Consumer" messaging, a consumer using automation is "typical Consumer operation", and 40 texts a month is far inside every threshold it lists (1,000 a day; 15 to 60 a minute). That guidance is voluntary and does not override a carrier's contract.

On the wording alone, a Verizon-family or AT&T line fits cleanly. Tello is the cheapest, with a clause that can be read against a gateway app. Adding a line to a family plan an Admin already has may cost less than any of these; that was not priced.

### Textbelt: a paid service with no registration

Textbelt sends from its own pool of numbers, and its customer registers nothing.

- **Terms.** "Indicate your name or business in your SMS." Recipients must have opted in, and recurring texts need opt-out wording. **(re-read)** Nothing refuses personal use.
- **Cost.** Prepaid, no monthly fee: $3 for 50 texts, $5 for 200, $10 for 700.
- **Delivery.** A status the calendar must poll for (no delivery webhook), with Textbelt's own warning that statuses are "not standardized between mobile carriers".
- **Replies.** A webhook, for US numbers on paid keys.
- **Weaknesses, all from its own pages.** The sending number comes from a shared pool and is the same one only "whenever possible", so Susan may not be able to save it as a contact. How the pool is registered with carriers is not disclosed, so it cannot be checked that a Reminder falls inside it. Textbelt publishes no delivery figures and says it is "not reliable enough" for anything affecting safety.

It is the fastest thing to try and a reasonable fallback. It is a weaker primary than a phone the family controls.

### Other routes in this family

| Route                                                       | Verdict                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Mac that stays on, sending iMessage (BlueBubbles, `imsg`) | Free, with delivered status and Replies. Arrives as a blue iMessage inside an Admin's own conversation with Susan, not as a text from the calendar. Apple supports no API for it, and a failure on macOS 26 is documented where a send reports success and nothing goes out. |
| A spare iPhone running a Shortcuts automation               | Apple documents time, email and message triggers that run without asking. It does not document whether a message leaves a locked phone, and user reports conflict. No delivery status reaches the calendar.                                                                  |
| A USB modem with a SIM                                      | Not recommended. 2025 reports show AT&T and Verizon SIMs in modems accepting a text and never delivering it.                                                                                                                                                                 |
| IoT SIMs (1NCE, Super SIM, Hologram)                        | Cannot text an ordinary phone, or only from a number Susan could not recognise or answer.                                                                                                                                                                                    |
| Carrier email-to-text addresses                             | AT&T's ended 17 June 2025. Verizon's ends by 31 March 2027.                                                                                                                                                                                                                  |
| Google Voice, TextNow                                       | Their terms forbid automated sending in plain words.                                                                                                                                                                                                                         |
| A reminder service with an API (YouGot)                     | Documents reminding someone else, but API access costs $79.99 a month and delivery status is not passed back.                                                                                                                                                                |
| SMS by Zapier, IFTTT                                        | Zapier sends through Twilio under Twilio's policy. IFTTT texts only the account holder's own phone.                                                                                                                                                                          |

## Finding 3: channels other than a text

The spec puts automated voice calls out of scope and builds everything on texts. These are recorded in case a second channel is wanted.

| Channel                                       | What it needs on Susan's iPhone                | Verdict                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated voice call (Twilio Voice)           | The number saved in her contacts               | Open to an individual: Twilio asks for photo ID, not a business or a purpose. Federal rules allow an artificial-voice call to a mobile with the person's prior consent, which may be spoken. About $2 a month. Calls carry the lowest caller-verification level, so a carrier may label or silence them. |
| Calendar alerts written into her own calendar | Her calendar account connected                 | Free. No delivery signal and no Replies. Apple does not document that alerts in a subscribed feed fire, so it needs a test on her phone.                                                                                                                                                                 |
| App notification from the installed calendar  | The app on her home screen, one permission tap | Free. Developers report subscriptions dying silently after days or weeks. A Focus mode silences it.                                                                                                                                                                                                      |
| Pushover or a Telegram bot                    | An app installed and signed in                 | Reliable, but depends on an app she must keep.                                                                                                                                                                                                                                                           |
| WhatsApp, Apple Messages for Business, RCS    | Varies                                         | Built for businesses.                                                                                                                                                                                                                                                                                    |

## The routes side by side

| Route                         | Ordinary text, unattended                | Delivery known                | Replies reach the app | Monthly cost         | Needs an approval                | Main risk                             |
| ----------------------------- | ---------------------------------------- | ----------------------------- | --------------------- | -------------------- | -------------------------------- | ------------------------------------- |
| Android phone gateway         | Yes, from one fixed number               | Sent: yes. Delivered: usually | Yes                   | $5 to $35 (the line) | No                               | The phone going quiet; carrier terms  |
| Textbelt                      | Yes, number may change                   | By polling, with caveats      | Yes                   | Under $1             | No                               | Undisclosed sending arrangement       |
| Vonage or Telnyx registration | Yes, if approved                         | Yes                           | Yes                   | About $3             | Yes; not documented for this use | Refusal after weeks and about $20     |
| Mac sending iMessage          | No: an iMessage in an Admin's own thread | Yes                           | Yes                   | $0                   | No                               | Unsupported by Apple; silent failures |
| Voice call                    | No: a call                               | Answered or not               | No                    | About $2             | Identity check only              | Silenced as an unknown caller         |

## Recommendation

**Send through an Android phone the family controls, running SMS Gateway for Android, on a line whose terms do not forbid it.** It is the only route that gives Susan an ordinary text from one fixed number, tells the calendar what happened to it, returns her Replies, and depends on no reviewer's approval.

It reverses one point in ADR 0001, which set aside sending from the owner's own device because Reminders would depend on that device staying on and the app could not tell whether a text arrived. The research changes the second half: these apps report sent and delivered. The first half stays true and is the cost of this route. It is managed by a heartbeat Alert, not removed.

Suggested order:

1. **Try it for a week before deciding.** Any spare Android phone, its existing SIM or a one-month prepaid one, the app in hosted mode, texting the owner's own iPhone. Check that texts arrive green, that sent, delivered and reply webhooks fire, and what happens when the phone restarts or loses Wi-Fi.
2. **Buy $3 of Textbelt at the same time** and send the same texts. If the gateway trial disappoints, this is the fallback, and the trial shows whether its number stays the same.
3. **If the trial holds, decide the line** from the carrier table, and record the decision in a new ADR that supersedes ADR 0001.

Not recommended: paying for a Vonage or Telnyx registration in the hope it passes. If the owner wants a registered number in the long run, a free question to Vonage's support, stating plainly that the texts are Reminders to one family member, costs nothing and can run alongside.

## What a change of route touches in this repository

This was the list for whoever carried the decision out. The change to Textbelt has since been made in each of these places.

- **ADR 0001.** Superseded by a new ADR; not edited.
- **The spec.** The text sender is already one of four narrow ports with "no provider-specific code", so the core is unaffected. The sections on Twilio's delivery reports, the reply endpoint's verification, and STOP being "honoured by the carrier and Twilio" need rewriting: on a personal line nothing honours STOP automatically, so the calendar would have to. A phone-offline Alert is new.
- **Tickets.** Ticket 05 (the owner registers with Twilio) falls away. Tickets 13, 17 and 18 name Twilio and need rewording.
- **`docs/twilio-registration-pack.md`.** No longer applies. The consent script and Confirmation text in `src/lib/consent.ts` are still worth keeping: asking Susan and confirming by text is right whoever sends.
- **The Public pages.** No reviewer would require them any more. They remain a truthful description of the app, and their wording about message frequency, STOP and HELP would need a small edit to match what the calendar does itself.
- **`CONTEXT.md`.** A term for the sending phone, if one is adopted.

## What is still not known

- Whether delivery reports arrive reliably from the chosen carrier to the chosen phone. One week's trial answers it.
- Whether Susan's iPhone ever answers a gateway phone over RCS. Test with RCS off on the gateway phone.
- Whether any carrier has acted against a personal line at this volume. No report was found either way.
- Whether Vonage, Telnyx or Sinch would approve a truthful personal application. No report was found either way.
- AT&T Prepaid and cheaper Tracfone prices, which could not be read.
- The 26 October 2026 amendment to the federal calling rule (47 CFR 64.1200), which matters only if voice calls are added.
