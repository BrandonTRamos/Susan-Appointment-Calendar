# Research part 4: texts sent from a real phone, SIM or personal messaging account

Researched 19 November 2026. Every claim is marked:

- **CONFIRMED**: I read it on the primary source today (the quote is copied from the page text).
- **CONFIRMED (archive)**: the live page refused my client (HTTP 403), so I read the Internet Archive copy of the same page; the snapshot date is given.
- **ANECDOTE**: a first-hand report by a user (issue tracker, forum). Not evidence of general behaviour.
- **NOT FOUND**: I looked and the source does not say, or the page would not load.
- **MY READING**: an inference I drew from confirmed text. Not a quote, not legal advice.

Pages that would not load are listed at the end.

---

## 1. Android phone as an SMS gateway

### 1.1 The maintained options

|                                         | SMS Gateway for Android (SMSGate)                                           | httpSMS                                                                                        | textbee                                                      | Traccar SMS Gateway                      |
| --------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| Repository                              | github.com/capcom6/android-sms-gateway                                      | github.com/NdoleStudio/httpsms                                                                 | github.com/textbee/textbee (was vernu/textbee)               | github.com/traccar/traccar-sms-gateway   |
| Licence (GitHub API)                    | Apache-2.0                                                                  | AGPL-3.0                                                                                       | AGPL-3.0                                                     | GPL-3.0                                  |
| Latest release (GitHub API, read today) | v1.79.1, 2026-11-19 (v1.79.0 on 11-17, v1.78.4 on 11-12)                    | v1.2.1, 2026-08-23; last push 2026-11-17                                                       | v2.10.0, 2026-11-13; last push 2026-11-19                    | v7.0.4, 2026-07-05; last push 2026-08-03 |
| Stars / open issues                     | 6,037 / 25                                                                  | 6,360 / 4                                                                                      | 3,378 / 69                                                   | 702                                      |
| Hosted relay                            | Yes, free                                                                   | Yes, free up to 200 SMS/month                                                                  | Yes, free up to 300/month (50/day)                           | Not examined                             |
| Self-host                               | Yes: local server on the phone, or own "private server"                     | Yes (Docker; needs own Firebase project and a rebuilt app)                                     | Yes (needs own Firebase project and a rebuilt app)           | Local HTTP API on the phone              |
| Sent / delivered webhooks               | `sms:sent`, `sms:delivered`, `sms:failed`                                   | `message.phone.sent`, `message.phone.delivered`, `message.send.failed`, `message.send.expired` | `MESSAGE_SENT`, `MESSAGE_DELIVERED`, `MESSAGE_FAILED`        | NOT FOUND (README does not say)          |
| Inbound webhook                         | `sms:received`                                                              | `message.phone.received`                                                                       | `MESSAGE_RECEIVED`                                           | NOT FOUND                                |
| Offline detection                       | `system:ping` webhook; `lastSeen` on `GET /device`; `/health` in local mode | `phone.heartbeat.offline` / `.online` webhooks                                                 | `lastHeartbeat`, battery and power fields on the devices API | NOT FOUND                                |

All repository facts above: CONFIRMED from `https://api.github.com/repos/<owner>/<repo>` and `/releases` today.

### 1.2 SMS Gateway for Android (capcom6, sms-gate.app)

**How the AWS app hands it a message.** CONFIRMED, README (https://github.com/capcom6/android-sms-gateway): "The SMS Gateway for Android can work in two modes: with a Local Server started on the device or with a Cloud Server. The basic API is the same for both modes". Cloud mode is a `curl` POST to `https://api.sms-gate.app/3rdparty/v1/...` with basic auth. The README also lists "**Message scheduling:** Schedule messages for future delivery using the optional `scheduleAt` field".

**How the relay reaches the phone.** CONFIRMED, https://docs.sms-gate.app/getting-started/public-cloud-server/: notification channel "Auto: Uses FCM when available, falls back to SSE (default)"; "SSE Only mode maintains a persistent HTTP connection, which may increase battery consumption and shows a persistent notification in the status bar." CONFIRMED, https://docs.sms-gate.app/features/ping/: scheduled pulls "Override the default 15-minute interval". So the worst case when a push is missed is a 15-minute poll unless Ping is set shorter.

**Status back.** CONFIRMED, https://docs.sms-gate.app/features/status-tracking/: states are "Pending", "Processed" ("Device prepared message, handed to Android SMS API"), "Sent" ("SMSC accepted message (Android API confirmation)"), "Delivered" ("Recipient device confirmed receipt (requires "withDeliveryReport": true)"), "Failed" ("Terminal error at any stage"). Caveat on the same page: "The Android OS may not report the final status of the message after a temporary error. In this case the message remains in the Sent state even if it was successfully delivered." Also: "Processed is terminal-unless-confirmed, and there is no automatic recovery."

**Webhooks.** CONFIRMED, README: events `sms:received`, `sms:sent`, `sms:delivered`, `sms:failed`, `system:ping` ("Periodic heartbeat event"), `app:started`. "Webhooks are transmitted directly from the device; therefore, the device must have an outgoing internet connection." CONFIRMED, https://docs.sms-gate.app/features/webhooks/: "Your server must respond with a 2xx status within 30 seconds to prevent retries"; "By default, the app will retry 14 times (approximately 2 days) before giving up"; "Webhook requests are signed with HMAC-SHA256".

**Cost.** CONFIRMED, https://docs.sms-gate.app/pricing/: "The SMS Gateway for Android™ is open-source software and is free to use." Cloud Server: "Completely free", "Individual limits applied only if affecting other users", "Recommended to notify support for >10k/day usage". Commitment: "All current features remain free forever", but "Possible paid tiers for new cloud users". Private Server: "Push notifications via Cloud", "Requires self-hosting". Server repository github.com/android-sms-gateway/server: Apache-2.0, v1.52.7 on 2026-11-15 (GitHub API).

**Battery, Doze, being killed.** CONFIRMED, https://docs.sms-gate.app/faq/general/: "The app provides an option to disable battery optimizations directly from the Settings tab under the "System" section." "The app also uses a foreground service with a wake lock". Cloud mode: "the app primarily relies on Firebase Cloud Messaging (FCM) push notifications, which functions without requiring power-saving mode to be turned off"; "High message rates could cause occasional delays when the device is in power-saving mode due to FCM's limitations on high-priority notifications." "Behavior may vary depending on the device manufacturer and specific Android customizations." Android's own documentation, CONFIRMED, https://developer.android.com/training/monitoring-device-state/doze-standby: in Doze the system "Suspends network access. Ignores wake locks." and "When the user wakes the device by moving it, turning on the screen, or connecting a charger, the system exits Doze and all apps resume normal activity." MY READING: a phone left on a charger is not in Doze, which is why every project says to keep it plugged in.

**Detecting the phone has gone offline.** CONFIRMED, FAQ: "You can use the GET /device endpoint ... The response includes a lastSeen field, showing the last time the device connected to the server. Due to the app's idle mode behavior, the device may only connect to the server once every 15 minutes, meaning the lastSeen time may not always represent the current status. Irrespective of the mode, you can register a system:ping webhook to monitor the device's online status." CONFIRMED, https://docs.sms-gate.app/features/ping/: "Navigate to Settings → Ping. Set the interval in seconds"; "Enabling the Ping feature may increase battery usage." The `/health` endpoint (local mode) reports battery level and connection (fetch-tool extract of https://docs.sms-gate.app/features/health/: battery "warn" below 25%, "fail" below 10%).

**Android 15+ install.** CONFIRMED, FAQ: "On Android 15+, Google Play Protect may block APK installation because the app is not distributed via Google Play." "the SMS permission may be grayed out in the Settings app by default. You must grant it manually."

### 1.3 httpSMS

CONFIRMED, README (https://github.com/NdoleStudio/httpsms): "You make a request to a simple HTTP API and it triggers your Android phone to send an SMS. SMS messages received on your android phone can also be forwarded to your webhook endpoint." The flow diagram shows "Send push notification about new message" then "[Async] Send result of sending SMS" and "[Async] Send Delivery Report". Push is Firebase: "The httpSMS application uses firebase cloud messaging for sending push notifications to your Android phone to trigger an SMS message to be sent out." Known weakness, in the author's words: "Sometimes it happens that the phone doesn't get the push notification in time and I can't send the SMS message. It is possible to set a timeout for which a message is valid and if a message becomes expired after the timeout elapses, you will be notified."

CONFIRMED, https://docs.httpsms.com/webhooks/events.md: "`phone.heartbeat.offline` ... The httpSMS app on your android phone sends a ping to the server ever 15 minutes. If the server doesn't receive a heartbeat event in a 1 hour interval, then your phone is considered to be offline." Also `message.phone.delivered`: "This event is emitted when an SMS is delivered to the recipient's phone." (fetch-tool extract of the same page).

Cost: CONFIRMED from the site's own source file (https://github.com/NdoleStudio/httpsms/blob/main/web/app/pages/index.vue; https://httpsms.com/pricing returned 404): Free plan "Send or receive up to **200** SMS/month"; paid plan "$10/month ... Send or receive up to **5,000** SMS/month". Licence AGPL-3.0. Self-hosting needs a Firebase project, SMTP, Cloudflare Turnstile and a rebuilt Android app (README, "Self Host Setup - Docker", steps 1 to 8).

### 1.4 textbee

CONFIRMED, https://textbee.dev/llms-full.txt (the project's full documentation): "The `200` response means textbee stored the message and queued it for your phone. ... textbee then pushes it to the phone. The phone hands it to the radio and reports `sent` when the carrier accepts it. If the carrier sends a delivery report, the status changes to `delivered`. If the phone is offline, the message waits until the phone comes back." Push is Firebase: "Firebase Cloud Messaging | Push service. The API uses it to wake the phone and hand it each message."

Delivery honesty, same file: "`sent` is the last state that every message reaches. `delivered` depends on the carrier. Some carriers do not send delivery reports." and "Treat `MESSAGE_SENT` as "left the phone" and `MESSAGE_DELIVERED` as a bonus when the carrier confirms."

Offline detection, same file: "The app sends a heartbeat to textbee at a fixed interval. ... It is 30 minutes by default. `lastHeartbeat` is the time of the last heartbeat that arrived." The devices API also returns `powerInfo.isIgnoringBatteryOptimizations`, `isPowerSaveMode`, `isDeviceIdleMode` and `batteryInfo`.

Keeping it alive, same file: "Android pauses apps in the background to save battery, and many phone makers add stricter rules on top. When Android pauses textbee, messages wait in both directions: sends stay `pending`, and incoming SMS upload late." "Keep the phone plugged in." "Use Wi-Fi for data. ... The SIM still needs mobile service to send and receive SMS." "Keep the SIM active. Check that the plan has SMS credit and that the SIM does not expire."

Cost: fetch-tool extract of https://textbee.dev/pricing: Free "$0/month", 1 active device, 50 messages/day, up to 300/month; Pro $14.99/month. Self-host: "The published app talks only to textbee.dev. Build the app with your own domain and Firebase project." Licence: AGPL-3.0 per GitHub API (a search summary said MIT; the repository says AGPL-3.0; the MIT items are the separate `textbee-mcp` and n8n packages).

Vendor's own US page (fetch-tool extract of https://textbee.dev/sms-gateway/us): "No registration step is part of textbee setup." and "Carriers can filter bulk patterns on consumer SIMs." This is a vendor claim, not a carrier statement.

### 1.5 Others

- **Traccar SMS Gateway**: CONFIRMED, README: "an Android messaging app. The key difference from other messaging apps is an option to expose HTTP API for sending SMS messages through the phone." Based on Fossify Messages. Delivery webhooks and inbound forwarding: NOT FOUND in the README.
- Other names that surfaced (huenique/sms-gateway-android, Telerivet, commercial apps) were not examined.

### 1.6 Does it arrive as a normal green-bubble text? RCS?

- CONFIRMED, Apple, https://support.apple.com/en-us/104972 (published 11 May 2026): "SMS/MMS messages appear in green text bubbles on your device." and "RCS messages appear in green text bubbles on your device."
- CONFIRMED, SMSGate FAQ: "Currently, the app does not support RCS (Rich Communication Services) messaging. It is recommended to disable RCS in Google Messages to avoid issues." Reasons listed: "No public API from Google".
- MY READING: the gateway sends through Android's SMS API, so the outgoing reminder is SMS and shows green on the iPhone. The RCS risk is on the reply: Apple says "If you aren't using iMessage, you can use RCS", so an iPhone may answer an RCS-registered Android number over RCS, and that reply lands in Google Messages where no gateway app can read it. Turning RCS off in Google Messages on the gateway phone (as SMSGate recommends) keeps replies on SMS. I found no primary source that states this reply behaviour in so many words: NOT FOUND.

---

## 2. Carrier terms for the sending line

### 2.1 What the consumer terms say

**AT&T** (Consumer Service Agreement, https://www.att.com/legal/terms.consumerServiceAgreement.html). CONFIRMED, section 2.5.2: "Our Messaging Services are provided solely for communication between, and/or initiated by, individuals for personal use. You may not use Messaging Services for commercial purposes, including, but not limited to: (1) sending unsolicited, unauthorized, spam, or other unwanted messages (whether SMS, MMS, RCS, or other); (2) sending or receiving unusually high numbers of messages or messages not originated on your Device; or (3) reselling or transferring messaging capabilities." The data section separately lists "automatic data feeds, or automated machine-to-machine connections; "auto-responders," "cancel bots," or similar automated or manual routines that generate excessive amounts of traffic". MY READING: no flat ban on software-sent texts; the test is personal use, by an individual, originated on the device, not unusually high volume.

**Verizon** (Customer Agreement, "Updated June 16, 2026", https://www.verizon.com/support/customer-agreement/). CONFIRMED: Verizon may limit or end service if you "(h) "spam," or engage in other abusive messaging or calling". No clause on automated or software-sent texts from a handset: NOT FOUND in the Customer Agreement. The plan page (https://www.verizon.com/support/important-plan-information/) says of voice "auto-dialed calls, telemarketing and similar services are prohibited" but its "Unlimited Messaging" paragraph has no such restriction. Several plan entries on that page carry the data condition "not available for machine-to-machine services".

**T-Mobile** (Terms and Conditions, "Effective September 1, 2026", https://www.t-mobile.com/responsibility/legal/terms-and-conditions). CONFIRMED, "WHAT ARE THE PROHIBITED USES...": "Unless explicitly permitted by your Rate Plan or Data Plan, you will not use ... your Services, Products, or Devices in a way that we determine: ... Uses applications which are designed for unattended use, automatic data feeds, automated machine-to-machine connections, or applications that are used in a way that degrades network capacity or functionality; Misuses the Services, including "spamming" or sending abusive, unsolicited, or mass automated communications". MY READING: "applications which are designed for unattended use" is broad enough to cover a gateway app, though it sits in a list about network capacity; "mass automated communications" does not describe 40 texts to one person.

**Mint Mobile** (Plan Terms & Conditions, "Last Updated: June 9, 2026"). CONFIRMED (archive, snapshot 2026-11-12 of https://www.mintmobile.com/plan-terms-and-conditions/), section 15: "You agree not to misuse the Service or Device, including but not limited to: ... (f) using the Service for automated text or picture messaging to another mobile device or email address; ... (k) using the Service in connection with server devices or host computer applications, including ... automated machine-to-machine connections, voice or SMS relay ...; (n) using the Service to relay voice calls or text and picture messages not originated from the Device". Also: "Unapproved modems, bypass, gateways, automated relay devices and any other non-approved devices used for commercial or re-direction purposes are not supported Devices". The Acceptable Use Policy (archive, 2026-11-12, https://www.mintmobile.com/acceptable-use-policy/) repeats: "Use your Mint Mobile Plan for automated text or picture messaging to another mobile device or email address". **This is an express ban.**

**US Mobile** (https://www.usmobile.com/terms, effective 23 June 2026 per fetch-tool extract). CONFIRMED (archive, snapshot 2026-11-11), section 13: "(f) using the Service for automated text or picture messaging to another mobile device or email address"; "(l) using the Service to relay voice calls or text and picture messages not originated from the Device; (m) using Unlimited Plans on any devices other than smartphones and tablets, including but not limited to modems, routers, or other non-mobile devices". **Express ban**, and modems are excluded on unlimited plans.

**Ultra Mobile** (plans terms, "Last Updated: October 1, 2024"). CONFIRMED (archive, older snapshot 2025-04-24 of https://www.ultramobile.com/mobile-plans-terms-conditions/): "(e) using the Service for automated text or picture messaging to another mobile device or email address". **Express ban.** I could not read a 2026 copy.

**Tello** (https://tello.com/terms). CONFIRMED (archive, snapshot 2026-11-10): prohibited uses include "Using applications which are designed for unattended use, automatic data feeds, automated machine-to-machine connections, or applications that are used in a way that degrades network capacity or functionality" and "Sending mass unsolicited email (SPAM), or other types of abusive, unsolicited, or other mass automated communications". Same wording family as T-Mobile.

**Visible** (https://www.visible.com/legal/terms-and-conditions). CONFIRMED: may limit or end service if you "(c) "spam," or engage in other abusive messaging or calling". No clause on automated texts: NOT FOUND.

**Tracfone** (https://www.tracfone.com/terms-and-conditions). CONFIRMED: "(c) "spam," or engage in other abusive messaging or calling". No clause on automated texts: NOT FOUND.

Summary, MY READING: Mint, US Mobile and Ultra forbid automated texting outright. T-Mobile and Tello forbid "applications which are designed for unattended use". AT&T limits messaging to personal use by individuals, originated on the device. The Verizon-family agreements I read (Verizon, Visible, Tracfone) forbid only spam and abusive messaging. On the text alone, a Verizon-family line is the cleanest fit; no agreement I read grants permission for software-sent texts.

### 2.2 CTIA Messaging Principles and Best Practices (May 2023)

Source: https://api.ctia.org/wp-content/uploads/2023/05/230523-CTIA-Messaging-Principles-and-Best-Practices-FINAL.pdf (PDF read today). All CONFIRMED.

- Terms: "The prior version of these Principles and Best Practices used the terms "Consumer (P2P)" and "Non-Consumer (A2P)."" The current terms are Consumer and Non-Consumer.
- 3.3.1: "A Consumer is an individual person who subscribes to specific wireless messaging services or messaging applications. Consumers do not include agents, representatives, or any other individuals acting on behalf of Non-Consumers".
- 3.3.2: "A Non-Consumer is a business, organization, or entity that uses messaging to communicate with Consumers."
- 4.1: "Consumer messaging is sent by a Consumer to one or more Consumers. ... Consumer messaging is generally conversational, and an incoming message typically generates a response from the recipient. Consumer messaging does not involve substantially repetitive messages".
- Exhibit I, "Attributes of Typical Consumer Operation": Throughput "15 to 60 messages per minute"; Volume "1,000 per day"; Unique Sender "1 telephone number assigned to or utilized by a single Consumer"; Unique Recipients "100 distinct recipients/telephone numbers per message"; Balance "1:1 ratio of outgoing to incoming messages per telephone number with some latitude in either direction"; Repetition "25 Repetitive Messages". The exhibit says these "are illustrative of (but do not determine whether messaging constitutes) Consumer messaging."
- 4.1.2 Consumer Messaging Automation: "Some Consumers utilize automation to assist in responding to communications. ... Such use of automation to assist Consumers in their composition and sending of messages falls within the attributes of typical Consumer operation. In contrast, automation in whole or in part used by a Non-Consumer to facilitate messaging is not typical Consumer operation."
- 4.2: Non-Consumer examples include "service alerts or notifications (e.g., fraud, airline), and machine-to-machine communications".

MY READING: 10 to 40 messages a month from one number to one recipient is far inside every numeric attribute. The sender is an individual, not a business, so 3.3.1 applies, and 4.1.2 says automation used by a Consumer is typical Consumer operation. Two attributes fit less well: balance (reminders are mostly one-way) and repetition (keep the wording varied by including the appointment details). The Principles are voluntary guidance; a carrier's own terms (2.1) still govern the line.

### 2.3 Cheapest plans that include SMS (carriers' own pages)

| Plan                        | Price                                                                 | What I read                                                                                                                                                                                                                           | Terms position (2.1)           |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Ultra Mobile PayGo          | $3/month                                                              | CONFIRMED (archive 2026-07-13, https://www.ultramobile.com/paygo/): "PayGo gives you 100 minutes of talk, 100 texts and 100MB 5G • 4G LTE Data for only $3 per month. ... texts are 1 cent each" beyond 100                           | Express ban on automated texts |
| Tello custom plan           | $5/month                                                              | CONFIRMED (archive 2026-11-10, https://tello.com/buy/custom_plans): "Minimum plan value: $5"; "Unlimited text is included with every plan."; the $5 pack's code is `M-PACK-300-UNLIMITED-NULL` (300 minutes, unlimited text, no data) | "unattended use" clause        |
| Tracfone                    | $20/month tier exists                                                 | CONFIRMED, https://www.tracfone.com/plans: "$20/mo or higher unlimited talk & text plans". Cheaper Tracfone plans: NOT FOUND in the page text I could extract                                                                         | Spam/abuse only                |
| Visible                     | "Starting at $25/mo" ($19 with a promo code for a year)               | CONFIRMED, https://www.visible.com/plans                                                                                                                                                                                              | Spam/abuse only                |
| Verizon Prepaid Talk & Text | $35/month, "$5/mo discount on the $35 Talk & Text plan" with Auto Pay | CONFIRMED, https://www.verizon.com/plans/prepaid/                                                                                                                                                                                     | Spam/abuse only                |
| T-Mobile prepaid            | Starter Monthly "$40/mo. for 1 line with AutoPay"                     | CONFIRMED (archive 2026-11-08, https://prepaid.t-mobile.com/prepaid-plans). The cheaper "Connect by T-Mobile" plans are linked but their prices were not in the page text                                                             | "unattended use" clause        |
| Mint, US Mobile             | from $15 and $17.50                                                   | US Mobile: fetch-tool extract of https://www.usmobile.com/plans, "Unlimited Flex: $17.50/mo". Mint price not read today                                                                                                               | Express ban                    |

The gateway phone can use home Wi-Fi for its internet link, so a plan with no data is enough (textbee doc: "Use Wi-Fi for data. ... The SIM still needs mobile service to send and receive SMS.").

AT&T Prepaid prices: NOT FOUND (https://www.att.com/prepaid/plans/ returned almost no text to my client).

---

## 3. iPhone or Mac as the sender

### 3a. iOS Shortcuts personal automations

**Which triggers can run with no confirmation.** CONFIRMED, Apple Shortcuts User Guide, "Enable or disable a personal automation", identical text in the iOS 18 edition (https://support.apple.com/guide/shortcuts/apd602971e63/8.0/ios/18.0) and the iOS 26 edition (https://support.apple.com/guide/shortcuts/apd602971e63/9.0/ios/26): "Some personal automations can run without asking you for confirmation when they're triggered. ... Turn off Ask Before Running, then tap Don't Ask to confirm your choice. ... The automation will not notify you when it's triggered. The following automations can be run automatically: Time of Day, Alarm, Sleep, Arrive, Leave, CarPlay, Email, Message, Transaction, Wi-Fi, Bluetooth, Apple Watch Workout, NFC, App, Airplane Mode, Do Not Disturb, Low Power Mode, Battery Level, Charger, Sound Recognition. Note: You also may need to set individual actions to run automatically. The following automation cannot be run automatically: Before I Commute".

The current guide is for iOS 27. CONFIRMED, "Add automations" (https://support.apple.com/guide/shortcuts/add-automations-apdfbdbd7123/ios): same list, and the switch has moved: "Tap Edit, then [icon]. Tap Privacy then enable Allow Running When Locked. The automation will not notify you when it's triggered." Also (https://support.apple.com/guide/shortcuts/intro-to-automation-shortcuts-apd690170742/ios): "Automation shortcuts are specific to a device."

**Triggers the server could fire.** CONFIRMED, "Communication triggers" (iOS 18 and iOS 26 editions, https://support.apple.com/guide/shortcuts/communication-triggers-apdd711f9dff/9.0/ios/26): "Use a communication trigger to run an automation when you receive an email or message." Email options: "Sender", "Subject Contains", "Account", "Recipient". Message options: "Sender" and "Message Contains: Triggers your automation when you receive a message containing the phrase you've added to this field." So the server can send an email with a known subject to the sending iPhone and the automation can start from it; a Message trigger on the recipient's replies could post them back to the server. A push-notification trigger: NOT FOUND in the trigger list. The Time of Day trigger (https://support.apple.com/guide/shortcuts/apd932ff833f/9.0/ios/26): "Time of Day: Triggers your automation at a specific time", repeating "Daily", "Weekly" or "Monthly"; it is a fixed clock time, so a polling design needs one automation per polling time.

**Fetching pending messages.** CONFIRMED, "Request your first API" (iOS 26 edition): "you create the URL that points at the API "endpoint" that you want to talk to, and then pass that URL to the Get Contents of URL action", with GET, POST, PUT, PATCH. Limitation (same guide, "API limitations"): "OAuth 2 ... is currently not supported."

**Does Send Message to one recipient run without confirmation in iOS 18 and iOS 26?** NOT FOUND in Apple's documentation. The only Apple statements are the note above ("You also may need to set individual actions to run automatically") and the release note at https://support.apple.com/101583: "Send Message now supports images and attachments when "Show When Run" is off", which confirms the action has a "Show When Run" switch. Apple does not document whether the message leaves a locked phone unattended.

**Reports.**

- ANECDOTE, Apple Community, 27 Sep 2023, iOS 17, https://discussions.apple.com/thread/255161843: with "run immediately" chosen for a timed iMessage, "it always pops up and asks before it sends"; the same poster says a colleague's iPhone 11 sent without asking.
- ANECDOTE, Apple Community, 29 Jan 2025, iOS 18, https://discussions.apple.com/thread/255948029: a volunteer gives steps (Alarm trigger, "Run Immediately", Send Message) and advises testing on your own number; the asker reported "it is not working" without detail.
- ANECDOTE (search summary only, thread not opened), https://discussions.apple.com/thread/255141835, titled "Automations won't send a message if phone is locked".
- No first-hand iOS 26 or iOS 27 report found: NOT FOUND.

**Limits.** No delivery status reaches the server (Shortcuts has no documented action that reads a sent message's delivered state: NOT FOUND). The iPhone must be on, online and, per the anecdotes, possibly unlocked. Automations are per device and nothing reports a missed run.

### 3b. A Mac that stays on

**Maintained bridges** (GitHub API today):

- `imsg` (github.com/openclaw/imsg, formerly steipete/imsg): MIT, v0.21.1 on 2026-11-16.
- BlueBubbles server (github.com/BlueBubblesApp/bluebubbles-server): Apache-2.0, v1.9.12 on 2026-10-27.
- mautrix/imessage: last push 2026-05-14, no releases listed; not examined further.

**How they send.** CONFIRMED, imsg README: "`imsg` is a Swift CLI for reading, watching, and sending iMessage and SMS from macOS. It reads the local Messages database, sends through Messages.app automation, and exposes NDJSON and JSON-RPC". "Full Disk Access is required for local database reads. Sending and standard tapbacks also require **Automation → Messages**". CONFIRMED, BlueBubbles docs (https://docs.bluebubbles.app/server/readme.md): "The server uses AppleScript to perform simple functions like sending messages & attachments and creating chats, and polls the `chat.db` database to see when new messages come in." It needs macOS: "must run within macOS".

**SMS or only iMessage.** CONFIRMED, imsg README: "For SMS, enable Text Message Forwarding on the paired iPhone." and docs/send.md: "`sms` — select the SMS relay account. Requires Text Message Forwarding enabled on your iPhone for this Mac. macOS can use RCS through that account". CONFIRMED, Apple, https://support.apple.com/en-us/102545: "With the Text Message Forwarding feature of your iPhone, the SMS, MMS, or RCS messages that you send and receive on your iPhone can also appear on your Mac"; "Make sure that your iPhone is turned on, connected to a Wi-Fi or cellular network, and can send and receive messages." So SMS from a Mac needs an iPhone with a SIM that stays on too; the Mac alone sends only iMessage. BlueBubbles: its FAQ (https://bluebubbles.app/faq/) answers "Does BlueBubbles support SMS?" with "Not at this time, though we hope to add this feature in the near future!"

**Delivery status and inbound.** CONFIRMED, BlueBubbles REST API & Webhooks page: webhooks for "New Messages", "Message Updates (delivered, read, etc)", "Message Errors". CONFIRMED, imsg docs/send.md: "every AppleScript text send waits up to eight seconds for the matching outgoing row" and "If Messages reports success but no row appears, `imsg` returns `may_have_completed`"; that check proves only that Messages recorded the outgoing message locally. A delivered or read field exposed by imsg: NOT FOUND in the README, send, watch or history docs I read. `imsg watch` streams new incoming messages (README: "Stream new messages, edits, unsends, and tapbacks"). Apple: "iMessage supports delivery and read receipts" (https://support.apple.com/en-us/104972). So for a delivered signal the documented choice is BlueBubbles' "Message Updates" webhook.

**Known unreliability.** CONFIRMED, imsg docs/send.md: "On macOS 26 (Tahoe), Messages.app has a failure mode where AppleScript reports success but writes an empty outgoing SMS row that isn't joined to the target chat. The send looks fine to the caller but never reaches the recipient." And docs/watch.md: "macOS sometimes drops or coalesces filesystem events — especially under heavy I/O, after sleep/wake". BlueBubbles has a guide titled "Prevent macOS from Sleeping".

**Apple's terms on automation.** CONFIRMED, macOS Tahoe licence (https://www.apple.com/legal/sla/docs/macOSTahoe.pdf, EA1955, 07/11/2025): "You further agree not to use the Apple Software and Services in any manner to spam, defraud, harass, abuse, stalk, threaten, defame or otherwise infringe or violate the rights of any other party". A clause forbidding scripted sending through Messages: NOT FOUND in that licence. BlueBubbles' own disclaimer: "This app is in no way affiliated with or endorsed by Apple". Apple publishes no supported API for sending iMessage; these tools drive the Messages app.

**What the recipient would see.** CONFIRMED, Apple: "Messages sent with iMessage appear in blue text bubbles on your device." MY READING: an iMessage sent from a family member's Apple Account arrives in the recipient's Messages app in the conversation with that family member, blue, mixed in with their ordinary chat, under whatever address the Mac sends from. BlueBubbles notes "By default, BlueBubbles will use your iCloud email to send iMessages", which can start a second thread separate from the phone-number thread unless the number is registered on the Mac. It is not a green SMS and it needs the recipient's iPhone to have data or Wi-Fi; Apple says iMessage falls back to cellular data, and SMS fallback from a Mac again needs the paired iPhone.

---

## 4. Cellular modem with a SIM (gammu, ModemManager)

**Software is maintained.** CONFIRMED (GitHub API): gammu/gammu, GPL-2.0, release 1.45.2 on 2026-11-09. CONFIRMED (freedesktop GitLab API): ModemManager tag 1.24.2 on 2025-07-28, development tag 1.25.95-dev on 2025-11-24.

**Delivery reports and inbound.** Fetch-tool extract of https://docs.gammu.org/smsd/config.html (gammu 1.45.2): `DeliveryReport`: "Whether delivery reports should be used, one of `no`, `log`, `sms`." (default `no`); `DeliveryReportDelay`: "Delay in seconds how long is still delivery report considered valid."; `RunOnReceive`: "Executes a program after receiving message."; `RunOnSent`; `RunOnFailure`: "Executes a program on failure."

**Does SMS work on US carriers after the 3G shutdowns?** No carrier or modem-maker document that states the requirement: NOT FOUND (the FCC 3G guide returned 403). What I found is forum evidence:

- ANECDOTE, Quectel forum, Aug 2025, https://forums.quectel.com/t/ec25-eu-x-sms-issue-with-ps-only/49560: a user testing AT&T and Verizon SIMs in EC25-AF(D) modules: "I confirmed that all the EC25-AF(D) are unable to send or receive SMS", while the same setup worked in Czechia; the module returned a message reference "but the receiving device gets nothing". A reply on 12 Jan 2026 written from the vendor's side (not labelled staff): "for most U.S. operators, SMS services are provided primarily through IMS, and SMS over NAS is not supported" and the module "may return OK at the AT interface level, but the SMS message may not be delivered by the network."
- ANECDOTE, Quectel forum, Nov 2024 to Mar 2025, https://forums.quectel.com/t/verizon-sms-or-data-but-not-both/39756: on a Verizon SIM in an RM521F-GL, "I can successfully configure the modem to either have internet data, or SMS"; a later poster got both working on a different module (RM551E-GL) with the default Verizon profile and a routing rule.
- CONFIRMED, AT&T's own list of devices that work on its network (https://www.att.com/scmsassets/support/wireless/devices-working-on-att-network.pdf, "Last Updated on 3/27/26"): model-specific ("Galaxy S20 models G981U and G981U1 will work on the AT&T network; Galaxy S20 models G981N and G981O will NOT work"), and "Models listed here are not guaranteed to work". The 14 pages list phones, tablets and a few hotspots; I saw no USB modem modules.
- US Mobile's terms bar unlimited plans "on any devices other than smartphones and tablets, including but not limited to modems, routers"; Mint's say "Unapproved modems, bypass, gateways, automated relay devices ... are not supported Devices" (section 2.1).

**Which modems are known to work for SMS on US consumer SIMs in 2026:** NOT FOUND. No first-hand 2026 success report located.

**Compared with the Android phone.** MY READING: a phone is a carrier-certified VoLTE/IMS device with a battery; a bare modem depends on IMS registration that the forum reports show failing silently (the modem says OK and nothing arrives), which also undermines the delivery signal. The Android route is the safer one.

---

## 5. IoT or programmable SIMs

- **1NCE**: not possible. CONFIRMED, https://help.1nce.com/docs/connectivity-services/connectivity-services-sms-services/sms-services-mo-sms: "Messages sent from an IoT devices with 1NCE SIM are only forwarded to application targets and not other devices." And "Features & Limitations": "With 1NCE connectivity, it is not possible to send Peer-to-Peer (P2P) MT-SMS between devices. ... The MT-SMS service is only intended to exchange messages with a server application controlled by the customer".
- **Twilio Super SIM** (now documented by KORE Wireless; twilio.com/docs/iot redirects to docs.korewireless.com): not possible. CONFIRMED, https://docs.korewireless.com/kore/api/products/supersim/smscommand-resource.md: "**SMS Commands** enable you to exchange machine-to-machine (M2M) messages with devices over SMS." "There is no publicly addressable phone number for your Super SIM meaning that you cannot send an SMS to it from another device." "Currently all SMS, regardless of the number to which they were sent, are treated as SMS Commands".
- **Hologram**: possible in principle, with an odd sender number. CONFIRMED, https://docs.hologram.io/guides/sims/what-communication-protocols-are-compatible-with-hologram-sims: "To send an SMS via the standard SMS switching network, use AT commands to request them from the cellular modem. Outbound SMS messages will appear as originating from an internal Hologram phone number. This is the case even if you have bought a phone number for receiving inbound SMS messages." "Device-originated SMS messages have a cost associated to them". "To receive SMS messages from other SMS-capable devices, you must buy a dedicated phone number". An API endpoint "Send an outbound SMS from a SIM" (`POST /sms/outgoing/`) also exists. ANECDOTE (search summary of Hologram community posts, not opened): users report US handset carriers not delivering messages from Hologram's non-geographic numbers.
- **Is it subject to A2P registration?** NOT FOUND. None of the three documents mention 10DLC or A2P registration for device-originated SMS. MY READING: Hologram's messages arrive from a number the recipient cannot save as a familiar contact and cannot reply to without a second purchased number, so even if delivered it fails want 3.

---

## 6. Carrier email-to-text gateways

- **AT&T (txt.att.net, mms.att.net): shut down.** CONFIRMED, https://www.att.com/support/article/wireless/KM1061254/: "Effective June 17, 2025, you can no longer send or receive texts using email." "On June 17, 2025, our email-to-text and text-to-email service was shut down." DNS today: `txt.att.net` has no MX record.
- **Verizon (vtext.com, vzwpix.com): being shut down.** CONFIRMED, https://www.verizon.com/support/vtext-vzwpix-shutdown/: "Verizon has begun the process of shutting down its legacy email-to-text functionality. We anticipate this process will be completed by 03/31/2027, although some senders may lose access to legacy email-to-text prior to that date. As of the completion of the shutdown, no one will be able to send texts via emails to Vtext.com or VZWPix.com."
- **T-Mobile (tmomail.net):** official notice NOT FOUND. Third-party pages disagree (some say dead since late 2024, one says still in service). DNS today: `tmomail.net` still has MX records. Not usable as a dependable route either way.

Verdict: dead as a route.

---

## 7. Google Voice and similar consumer numbers

- **Google Voice.** CONFIRMED, Voice Acceptable Use Policy, https://support.google.com/voice/answer/9230450: "Do not send or facilitate the transmission of spam, large numbers of commercial messages, or automated messages. Such activity includes ... sending messages via an automated process, such as a script" and "Do not automate our system to place phone calls or send messages automatically." Also: "Google may reclaim your Google Voice number ... if you do not appear to be making use of the service ... for a period of 3 months." An official Google Voice messaging API: NOT FOUND (no Google page describing one).
- **TextNow.** CONFIRMED, Terms (last updated 30 Oct 2025), https://www.textnow.com/terms, section 23: "(f) You will not use the TextNow Properties for the purpose of autodialing, robo dialing, robo calling, or any other automated calling or messaging; (g) You will not use third party software, applications, or systems to use or connect to the TextNow Properties, including, but not limited to for purposes of attempting to automate calling or messaging; (h) You will use TextNow's Services solely for personal, non-commercial, "peer to peer" communication and use." Official API: NOT FOUND.

Verdict: both forbid automated sending in plain words.

---

## 8. First-hand reports of running a gateway (all ANECDOTE)

I found no 2025/2026 account of someone running a gateway for months specifically for family reminders, and no report of a carrier blocking a line at this volume: NOT FOUND. Searches returned mostly vendor pages. What exists is in the projects' issue trackers:

1. **Delivery reports stopped after an Android update; US T-Mobile.** Issue #486, opened 19 Nov 2026, https://github.com/capcom6/android-sms-gateway/issues/486. Samsung Galaxy A17 5G "(US, T-Mobile)", Android 17, private server, app 1.75.0 "since September". "Up to Nov 9, 2026 ...: reports work. 5,637 messages reached `Delivered` on this device, about 99% of sends on Nov 8–9." "Since then: 0 of about 1,000 messages reached `Delivered`." The carrier's reports still reach the phone ("Android's own SMS store on the same phone does mark these messages delivered"); the app cannot decode them. Open, no fix yet. Two lessons: T-Mobile US does return delivery reports, and a phone OS update can silently break the delivered signal while sending keeps working. No carrier block is mentioned despite about 1,000 sends in ten days.
2. **Inbound forwarding died silently after days of uptime.** Issue #440, opened 30 Aug 2026, https://github.com/capcom6/android-sms-gateway/issues/440. Motorola Moto G Stylus (2023), Android 13, plugged in, battery "Unrestricted": "After several days of normal operation, the app silently stops receiving incoming SMS. The sms:received webhook stops firing entirely"; "device uptime was 17 days at time of failure". The maintainer's interim advice: "Keep the charger connected 24/7." and "Set a silent alarm every 15 minutes to prevent the device from going to sleep." The user worked around it with a daily scheduled restart of the service, then confirmed a test build fixed it ("#444 working great!", 10 Sep 2026). The README now lists "Reliable background capture: SMS, data SMS, and MMS receivers are declared in the manifest ... so incoming messages are still delivered if the system kills the app process."
3. **Messages stuck at Pending, and a duplicate send.** Issue #330, opened 13 Mar 2026, still open, https://github.com/capcom6/android-sms-gateway/issues/330. A second user on 14 Nov 2026, version 1.78.4, local mode: "Outgoing SMS messages are successfully delivered to recipients, but their status in SMSGate remains "Pending". When I restart the Local Server within SMSGate, the most recent message can be transmitted again, resulting in duplicate SMS messages being received."
4. **httpSMS author on missed pushes** (README, undated): "Sometimes it happens that the phone doesn't get the push notification in time and I can't send the SMS message."

What broke, across these: the status signal (delivered, or even sent) more often than the sending itself; inbound forwarding after long uptime; behaviour changing with phone OS updates. The maintainer of SMSGate responds within a day and ships fixes within days to weeks (release cadence in 1.1).

---

## Pages that would not load

- Mint, US Mobile, Tello, Ultra Mobile terms and plan pages: HTTP 403 to my client; read from the Internet Archive instead (dates given above). Ultra's terms snapshot is from April 2025.
- Red Pocket plans (https://www.redpocket.com/plans): 403 live and in the archive. Not read.
- AT&T Prepaid plans: page returned almost no text. Not read.
- FCC 3G phase-out guide (https://www.fcc.gov/consumers/guides/plan-ahead-phase-out-3g-cellular-networks-and-service): 403. Not read.
- ModemManager mailing-list post on Quectel EC25 and AT&T (lists.freedesktop.org, April 2024): 403. Not read.
- https://httpsms.com/pricing: 404; prices taken from the site's source file in the repository.
- A Reddit r/selfhosted mirror thread (July 2025): 403. Not read.
- Hello Mobile and Twigby plan pages: did not load. Not read.

---

## Verdict for this part

The four wants: (1) unattended, on time, arrives as an ordinary text; (2) the app learns whether it was delivered; (3) replies reach the app; (4) low cost.

### Ranked

**1. Android phone running SMS Gateway for Android (capcom6), in cloud or private-server mode.** Meets all four.

- Want 1: yes. The AWS app calls an HTTPS API; the phone sends a real SMS that shows green on the iPhone.
- Want 2: yes, with a caveat. `sms:sent` and `sms:delivered` webhooks exist; "Delivered" depends on the carrier's report and on the phone decoding it (anecdote 1 shows it breaking after an OS update). Treat "sent" as the dependable signal and "delivered" as a bonus, and alert when neither arrives.
- Want 3: yes, `sms:received` webhook, provided RCS is turned off on the gateway phone.
- Want 4: software and relay are free. The line is the cost.
- Buy and keep running: a spare Android phone on a charger and on Wi-Fi, battery optimisation off for the app, RCS off, plus a SIM. Line cost by terms position: Tello $5/month (terms forbid "applications which are designed for unattended use"); Tracfone (its page refers to "$20/mo or higher unlimited talk & text plans"; cheaper tiers not confirmed), Visible $25/month or Verizon Prepaid Talk & Text $30 to $35/month (their agreements forbid only spam and abusive messaging). Ultra PayGo $3, Mint and US Mobile expressly forbid automated texting.
- Monthly cost: $5 to $35 depending on which terms risk the owner accepts.
- Main way of failing: the phone goes quiet (app paused, Wi-Fi drop, OS update, dead battery or SIM lapse) and nothing is sent. Mitigation is built in: `system:ping` webhook or `lastSeen`, checked by the AWS app, with an alert to the owner. Second: the carrier acts on its terms; no report of that at this volume was found.
- httpSMS (free to 200 SMS/month, heartbeat-offline webhook after 1 hour) and textbee (free to 300/month, 50/day) are workable substitutes with the same shape. SMSGate is preferred for the faster release cadence, the 15-minute fallback poll, the free relay with no monthly cap, and Apache-2.0.

**2. A Mac that stays on, sending iMessage through Messages (imsg or BlueBubbles).** Meets wants 1 to 3 only if a Mac is already on all day; costs nothing monthly.

- Want 1: partly. It arrives in the recipient's Messages app as a blue iMessage in the family member's own conversation, not as an ordinary text, and needs the recipient's iPhone to have data. Sending SMS instead needs a paired iPhone left on with Text Message Forwarding.
- Want 2: yes for iMessage through BlueBubbles, which documents a "Message Updates (delivered, read, etc)" webhook. imsg documents only a local "sent" check.
- Want 3: yes (`imsg watch`, BlueBubbles "New Messages" webhook).
- Buy and keep running: an always-on Mac signed in to a family member's Apple Account, kept awake, with Full Disk Access and Automation permission granted to the tool, reachable from AWS (tunnel or outbound polling).
- Monthly cost: $0 beyond electricity.
- Main way of failing: Apple offers no supported API; the tools script the Messages app and break with macOS releases (the documented macOS 26 "ghost row" failure where a send reports success and nothing goes out), plus sleep, sign-outs and permission resets. Reminders also mix into the family member's personal thread.

**3. A spare iPhone with a Shortcuts automation.** Meets want 1 on paper, wants 2 and 3 poorly.

- Apple documents Time of Day, Email and Message triggers as able to run without asking in iOS 18, 26 and 27, and Get Contents of URL can fetch pending messages. Apple does not document whether Send Message leaves a locked, unattended phone; user reports conflict.
- Want 2: no delivery status reaches the server. Want 3: only by a second Message-trigger automation posting replies back.
- Buy and keep running: an iPhone with a line, on a charger. Monthly cost: the line.
- Main way of failing: the automation prompts or does not fire while locked, and nothing tells the server. It would need a hands-on test on the exact iOS version before any trust.

**4. USB LTE modem or Pi HAT with gammu or ModemManager.** Not recommended in the US.

- The software is maintained and supports delivery reports and inbound hooks, but forum reports from 2025 show modems on AT&T and Verizon SIMs accepting an SMS and never delivering it, because US networks carry SMS over IMS. No confirmed working modem-and-plan pairing for 2026 was found, and several low-cost carriers' terms exclude modems.
- Cost: hardware plus the same line. Main way of failing: silent non-delivery with an "OK" from the modem.

**5. IoT SIMs.** 1NCE and Super SIM cannot text an ordinary handset at all. Hologram can, but from "an internal Hologram phone number", billed per message, with replies needing a separately bought number. Fails want 3 and probably want 1.

**Ruled out.** Carrier email-to-text gateways (AT&T shut on 17 June 2025; Verizon shutting by 31 March 2027; T-Mobile unconfirmed). Google Voice and TextNow (their terms forbid automated sending in plain words and neither has an official API).

### The open risk the owner must decide

No consumer agreement I read grants permission for software-sent texts, and three low-cost carriers forbid them outright. CTIA's Principles treat an individual's own automated messages as Consumer traffic, and the volume here is far inside every CTIA attribute, but the Principles do not override a carrier's terms. The lowest-risk pairing on the texts I read is the Android gateway on a Verizon-family line (Tracfone, Visible or Verizon Prepaid); the cheapest is Tello at $5 with a clause that can be read against it.
