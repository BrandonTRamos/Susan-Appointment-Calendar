# Research part 5: reaching her iPhone without SMS from a provider or a phone

Researched 19 November 2026. Every claim carries a status:

- **CONFIRMED**: I read the quoted words on the primary source today.
- **SNIPPET**: a search result quoted the primary page, but the page itself would not load or I did not open it. Treat as a pointer, not evidence.
- **ANECDOTE**: a first-hand report from a user or developer, not a vendor statement.
- **NOT FOUND**: I looked and the source does not say.

Notes on method. Apple's iPhone User Guide pages now carry a version switcher that lists iOS 27 as well as iOS 26 and iOS 18; the guide text I read is the current default version and does not state which iOS it describes. Where a page would not load, it is named in the section it belongs to. Nothing below is legal advice.

---

## 1. Automated voice calls

### 1.1 What the law says (TCPA and FCC rules)

**CONFIRMED.** The rule allows an artificial or prerecorded voice call to a mobile number when the called person has given prior express consent. 47 CFR 64.1200(a)(1), read today from the eCFR API (`https://www.ecfr.gov/api/versioner/v1/full/2026-11-01/title-47.xml?part=64&section=64.1200`):

> "(a) No person or entity may: (1) Except as provided in paragraph (a)(2) of this section, initiate any telephone call (other than a call made for emergency purposes or is made with the prior express consent of the called party) using an automatic telephone dialing system or an artificial or prerecorded voice; ... (iii) To any telephone number assigned to a paging service, cellular telephone service, specialized mobile radio service, or other radio common carrier service, or any service for which the called party is charged for the call."

**CONFIRMED.** Written consent is only required when the call advertises or telemarkets. Same section, (a)(2):

> "Initiate, or cause to be initiated, any telephone call that includes or introduces an advertisement or constitutes telemarketing, using an automatic telephone dialing system or an artificial or prerecorded voice, to any of the lines or telephone numbers described in paragraphs (a)(1)(i) through (iii) of this section, other than a call made with the prior express written consent of the called party..."

**CONFIRMED.** For a non-telemarketing call to a wireless number the consent may be oral or written. FCC 12-21, paragraph 29 (`https://docs.fcc.gov/public/attachments/FCC-12-21A1.txt`):

> "We leave it to the caller to determine, when making an autodialed or prerecorded non-telemarketing call to a wireless number, whether to rely on oral or written consent in complying with the statutory consent requirement."

**CONFIRMED.** Every artificial-voice message must identify the caller and give a phone number. 64.1200(b):

> "(b) All artificial or prerecorded voice telephone messages shall: (1) At the beginning of the message, state clearly the identity of the business, individual, or other entity that is responsible for initiating the call. ... (2) During or after the message, state clearly the telephone number (other than that of the autodialer or prerecorded message player that placed the call) of such business, other entity, or individual."

**CONFIRMED.** The automated opt-out mechanism in (b)(3) is tied to telemarketing calls and to calls made under the residential-line exemptions:

> "(3) In every case where the artificial or prerecorded-voice telephone message is made pursuant to an exemption under paragraphs (a)(3)(ii) through (v) of this section or includes or introduces an advertisement or constitutes telemarketing ... provide an automated, interactive voice- and/or key press-activated opt-out mechanism..."

My reading (not a quote): a consented, non-commercial reminder to her mobile is neither telemarketing nor an (a)(3) exemption call, so (b)(3) does not appear to apply, but (b)(1) and (b)(2) do. The message should open with who is calling and include a family phone number.

**CONFIRMED.** A machine-generated voice counts as "artificial". FCC 24-17, paragraphs 2 and 5 (`https://docs.fcc.gov/public/attachments/FCC-24-17A1.txt`):

> "we confirm that the TCPA's restrictions on the use of "artificial or prerecorded voice" encompass current AI technologies that generate human voices."

> "Therefore, callers must obtain prior express consent from the called party before making a call that utilizes artificial or prerecorded voice simulated or generated through AI technology."

**NOT FOUND.** The words "text-to-speech" do not appear in FCC 24-17. Treat a text-to-speech reminder as an artificial voice call and get her consent.

**SNIPPET, not read on the primary source.** The eCFR text carries the note "Link to an amendment published at 91 FR 67219, Oct. 26, 2026." Law-firm alerts describe it as a change to the consent-revocation rule in 64.1200(a)(10), effective 25 November 2026. `federalregister.gov` redirected my request to an access-check page, so I could not read the amendment itself.

### 1.2 Is registration required for voice, the way A2P 10DLC is for SMS?

**CONFIRMED.** Twilio does not gate voice calls behind registration, but an account with no approved Business Profile gets the lowest STIR/SHAKEN attestation. `https://www.twilio.com/docs/voice/trusted-calling-with-shakenstir/shakenstir-onboarding`:

> "When a customer has the following, the call will be signed with `A` level attestation:" "Approved Business Profile" / "Approved SHAKEN/STIR Trust Product that is linked to the Business Profile" / "Phone number(s) assigned to both the Business Profile & SHAKEN/STIR Trust Product"

> "When a customer does the following, their calls will be signed with `C` level attestation:" "No approved Business Profile(s) and SHAKEN/STIR Trust Product(s)"

**CONFIRMED.** Attestation levels, `https://www.twilio.com/docs/voice/trusted-calling-with-shakenstir`: A is "the highest attestation given by the originating service provider to indicate that the caller is known"; C is "it doesn't meet the requirements of A or B including international calls."

**CONFIRMED.** Voice Integrity (Twilio's spam-label remediation) needs a business with an EIN or DUNS. `https://www.twilio.com/docs/voice/spam-monitoring-with-voiceintegrity`:

> "Have an Approved Primary or Secondary Business Profile." / "A registration authority, either an Employer Identification Number (EIN) or a Data Universal Numbering System (DUNS) number" / "A functioning secure website URL (`https://`)"

> "it won't make your numbers fully immune to spam labels."

**SNIPPET.** CNAM (caller name) on Twilio: "Your Business Profile must be associated with an Employer Identification Number (EIN) or a Data Universal Numbering System (DUNS) number. CNAM is displayed only if the recipient has enabled the CNAM feature on their phone through their carrier." (`https://www.twilio.com/docs/voice/brand-your-calls-using-cnam`, quoted by search; page not opened.)

**CONFIRMED.** Twilio has an Individual profile type, `https://www.twilio.com/docs/trust-hub/profiles/primary-compliance-profiles`: "Individual profiles cover sole proprietors or individual users exploring Twilio products." **NOT FOUND:** that page does not say whether an Individual profile can obtain A attestation, Voice Integrity, or CNAM. The onboarding page above names only a Business Profile.

Conclusion for Twilio: an individual can place the calls, but as documented cannot get A attestation, Voice Integrity or CNAM. The call will arrive as an unbranded number with C attestation.

**CONFIRMED.** AWS End User Messaging voice needs a US number that is itself behind business registration. `https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-request.html`:

> "Before requesting a 10DLC phone number you must have an approved 10DLC registered brand and 10DLC registered campaign to associate with the 10DLC phone number." / "The **Messaging capabilities** (SMS, MMS, or VOICE) are specified in the 10DLC registered campaign and applied to your 10DLC phone number request."

Toll-free numbers also "support both SMS, MMS, and voice messages" and appear in the registration list (`https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations.html`). So AWS voice hits the same wall as AWS SMS. Voice quotas (`https://docs.aws.amazon.com/sms-voice/latest/userguide/quotas.html`): sandbox "20 messages" per 24 hours and "30 seconds" length; "Number of voice messages that can be sent to a single recipient during a 24-hour period | 5 messages".

**SNIPPET.** Amazon Connect: "Connect Customer does not allow anonymous calls (calls without caller ID)" and the caller ID "must be one you have claimed or ported in to your number inventory" (`https://docs.aws.amazon.com/connect/latest/adminguide/queues-callerid.html`). **NOT FOUND:** whether a personal AWS account may claim a US number in Connect; the outbound restrictions page I opened covers international calling only.

**SNIPPET.** Telnyx: "most users are automatically Level 1 verified after confirming their email" with voice "limited to US use"; Level 2 asks for "a contact number and company name" (`https://support.telnyx.com/en/articles/1130595-account-verification`). Not opened.

**NOT FOUND.** Plivo's individual-account or attestation rules; I read only its pricing page.

### 1.3 Cost per call

**CONFIRMED.** Twilio US, `https://www.twilio.com/en-us/voice/pricing/us`: outbound to a US number "$0.0140" per minute; local number "$1.15" per month; answering machine detection "$0.0075" per call; basic text-to-speech voices free, Neural "$0.0032 per 100 characters"; Branded Calling "$0.12 per call" (needs a business). At 40 one-minute calls a month that is about $0.56 in minutes plus $1.15 for the number, roughly $1.70 a month, or about $2.00 with answering machine detection on every call. (Arithmetic is mine; I did not confirm Twilio's billing increment.)

**CONFIRMED.** Plivo US, `https://www.plivo.com/voice/pricing/us/`: outbound "$0.0115/min"; local number "$0.50/month".

**CONFIRMED.** AWS End User Messaging, `https://aws.amazon.com/end-user-messaging/pricing/`: US outbound voice "$0.013 per minute"; 10DLC number "$1" per month; toll-free "$2 per month".

**SNIPPET.** Telnyx and Amazon Connect prices appeared only in search summaries with conflicting figures. Not confirmed.

### 1.4 Will her iPhone silence the call?

**CONFIRMED.** The setting has three positions and it applies to numbers not saved in Contacts. `https://support.apple.com/en-us/111106`:

> "Choose how to manage incoming calls from unsaved numbers. This means phone numbers that aren't saved in your contacts."

> "Never means calls from unsaved numbers ring like any other call; Ask Reason for Calling means these calls are screened (the caller is asked why they're calling before your phone even rings); and Silence automatically silences these calls and sends them to voicemail."

**CONFIRMED.** Saving the number as a contact is Apple's stated way to keep such calls ringing. Same page:

> "Add important numbers to your Contacts—family, friends, your child's school, your doctor's office, and so on. This way, you always see these calls."

**CONFIRMED.** iPhone User Guide, `https://support.apple.com/guide/iphone/screen-and-block-calls-iphe4b3f7823/ios`:

> "Call Screening automatically answers calls from unknown numbers without interrupting you. After the caller shares their name and reason for their call, your iPhone rings and shares their response so you can decide if you want to pick up."

> "Silence: Calls from unsaved numbers will be silenced, sent to voicemail, and appear in the Recents list."

An automated call that meets "Ask Reason for Calling" would have to answer a spoken question before her phone rings. Saving the number avoids the screen.

**CONFIRMED.** A separate carrier-driven filter can still silence a saved-or-unsaved number that the carrier flags. Same guide page:

> "Spam: Calls identified by your carrier as potential spam or fraud are silenced, sent to voicemail, and moved to the Spam list."

**NOT FOUND.** Whether a saved contact overrides the carrier Spam filter; and which of the three screening positions is the default on a new or updated iPhone.

**CONFIRMED.** A contact can be allowed through silent mode and Focus. `https://support.apple.com/guide/iphone/allow-or-silence-notifications-for-a-focus-iph21d43af5b/ios`:

> "You can allow sounds and vibrations from emergency contacts to come through even when your iPhone or notifications are silenced."

### 1.5 Voicemail, and telling answered from not answered

**CONFIRMED.** Twilio call statuses, `https://www.twilio.com/docs/voice/api/call-resource`: `completed` "The call was answered and has ended normally."; `no-answer` "There was no answer or the call was rejected"; `busy` "The caller received a busy signal."; `failed` "The call could not be completed as dialed, most likely because the provided number was invalid."

**CONFIRMED.** A voicemail pickup counts as "answered" unless answering machine detection is used. `https://www.twilio.com/docs/voice/answering-machine-detection`:

> "If you would like to leave a voicemail on an answering machine, specify `DetectMessageEnd`."

Results with that option: "`machine_end_beep`, `machine_end_silence`, `machine_end_other`, `human`, `fax`, `unknown`". Accuracy caveat: "it's possible that AMD will not always return the right answer." and "The AMD engine may, for example, interpret a very short two-second voicemail greeting as a human picking up."

So the app can record human, machine, no-answer, busy or failed for each call, with some misclassification. A stronger proof of receipt is asking her to press a key; I did not read Twilio's keypress documentation today, so that is **not verified here**.

---

## 2. Web push from the installed PWA

### 2.1 Requirements

**CONFIRMED.** `https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/`:

> "Now with iOS and iPadOS 16.4, we are adding support for Web Push to Home Screen web apps."

> "A web app that has been added to the Home Screen can request permission to receive push notifications" ... "as long as that request is in response to direct user interaction"

> "You do not need to be a member of the Apple Developer Program to use it."

**CONFIRMED.** Apple's developer article (`https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers`, read through its JSON data file): "Add web push to Home Screen web apps in iOS 16.4 or later".

**CONFIRMED.** iPhone User Guide, `https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios`: "An icon for the web app is added to your Home Screen. When you tap the icon, the website opens just like an app. You can receive notifications from the web app and quit the web app like you would any app."

### 2.2 How noticeable

**CONFIRMED.** WebKit, same post: "They show on the Lock Screen, in Notification Center, and on a paired Apple Watch." and "Notifications for Home Screen web apps on iPhone and iPad integrate with Focus".

**CONFIRMED.** A Focus can silence a web app. `https://support.apple.com/guide/iphone/allow-or-silence-notifications-for-a-focus-iph21d43af5b/ios`: "You can allow or silence notifications from specific web apps you've added to your Home Screen."

**CONFIRMED.** Per-app notification controls exist, but are conditional. `https://support.apple.com/guide/iphone/change-notification-settings-iph7c3d96bab/ios`: "Choose a notification sound: If the app supports it, tap Sounds, then select a sound." and "Allow time-sensitive notifications: If the app supports it, turn on Time Sensitive Notifications."

**NOT FOUND.** Any Apple or WebKit statement that a web app's notification plays the same sound as a text, can be marked Time Sensitive, or can be made persistent. Nothing I read lets a web push break through a Focus or repeat until seen.

### 2.3 Can delivery be confirmed?

**CONFIRMED.** The push service reports only that it accepted the request. Apple's developer article lists the status codes: "201 | Success." and "410 | The device token has expired." It also says the service may hold a message and drop it:

> "If the push service can't deliver a notification immediately, it may store the notification for 30 days or fewer, depending on the value you specify. ... If the push service can't deliver the notification, the push service removes the notification from storage permanently. The number of notifications the push services stores while the device is offline is limited."

**NOT FOUND.** Any delivery or display receipt from Apple's push service. The app can learn that a subscription is dead (410) but not that a notification was shown. (My inference, not a quote: the service worker could report back when a push arrives, which would be the app's own receipt, and it would fail in exactly the cases where the push does.)

### 2.4 Known failure modes

**CONFIRMED.** Permission is revoked if a push does not show a notification. Apple's developer article:

> "Safari doesn't support invisible push notifications. Present push notifications to the user immediately after your service worker receives them. If you don't, Safari revokes the push notification permission for your site."

**CONFIRMED.** WebKit names the weaknesses of the original design, `https://webkit.org/blog/16535/meet-declarative-web-push/`:

> "if an event handler doesn't show the user visible notification for any reason we revoke its push subscription."

> "ITP removing a service worker registration would render the push subscription useless."

Declarative Web Push addresses this ("there is no penalty for service workers failing to display a notification") and "You can test it out on iOS 18.4".

**CONFIRMED (WebKit engineer, in a bug report).** `https://bugs.webkit.org/show_bug.cgi?id=273063`:

> "We don't fire PushSubscriptionChangeEvent"

> "We did fix a number of bugs with Web Push on iOS recently (which should be in 17.5 RC), but the bugs weren't in WebKit but rather in Web.app, e.g. bugs where Web.app would handle the push, but then tell WebKit that the website didn't have permissions anymore, which would then result in the subscription being deleted."

**ANECDOTE.** Apple Developer Forums thread `https://developer.apple.com/forums/thread/728796`, no Apple staff reply in the thread:

- April 2023: "they work great for a little bit and then they suddenly stop working"
- June 2023: "the webpush endpoint created expires in a week or two, and it just disappears from the downloaded pwa out of nowhere without any signs."
- July 2023: "It stops working randomly and I have to delete the app from the home screen, clear cache and re-do the subscription process all over again to get it working."
- January 2024, iOS 17: "the PushSubscription will work for a bit, and then the subscription will somehow be lost."
- February 2025, iOS 18.1.1 and 18.3: "Subscription works initially... but stops after some 100s of notification out of the sudden."

**ANECDOTE (search snippet, thread not opened).** A forum operator reported for an iOS 18 Home Screen web app that pushes eventually stop if the person never taps them or opens the app (`https://forums.macrumors.com/threads/macrumors-pwa-web-app-with-push-notifications.2448775`).

**NOT FOUND.** First-hand reports specific to iOS 26 web push. The iOS 26 reports my search returned concerned video playback in web apps, not push.

---

## 3. iMessage and Apple channels

**CONFIRMED.** Apple Messages for Business is for companies working through an approved provider. `https://register.apple.com/resources/messages/messaging-documentation/`:

> "To qualify for an Apple Messages for Business account, your company needs to select an Apple-approved" Messaging Service Provider.

FAQ, `https://register.apple.com/resources/messages/messaging-documentation/faq`: "a company requires the services of an Apple-approved Messaging Service Provider (MSP)." and "Only one commercial account per business is allowed." and "while Apple provides Apple Messages for Business for free, an MSP may charge for their services."

**CONFIRMED.** The business cannot open the conversation. Policies, `https://register.apple.com/resources/messages/messaging-documentation/policies`:

> "Your business is prohibited from sending unsolicited messages." / "Your business may only send a message in response to an active conversation"

FAQ: "Businesses can send proactive messages to customers who have previously started a conversation." and "The customer must initiate a new conversation to receive further messages".

**CONFIRMED.** Two more blockers on the policies page: "The business must provide access to a live agent in this channel during its regular business hours." and "At this time, Apple is not onboarding businesses that primarily offer medical or health-related services or products."

**NOT FOUND.** An explicit sentence excluding individuals. The pages speak only of a "company" and a "business".

**NOT FOUND.** Any Apple-documented API for software to send an iMessage to a person. I did not research a native iOS app with Apple Push Notification service; it would need an app installed on her phone, which the brief treats as a risk. Sending iMessage from a family member's own device is another researcher's part.

---

## 4. Calendar-native reminders

### 4.1 Subscribed ICS feed

**CONFIRMED.** She can subscribe and alerts can be switched on per calendar. `https://support.apple.com/guide/iphone/use-multiple-calendars-iph3d1110d4/ios`:

> "Subscribe to an external, read-only calendar: Tap Add Subscription Calendar, enter the URL of the .ics file you want to subscribe to (and any other required server information), then tap Find."

> "You can turn on event notifications for calendars you create or subscribe to." ... "Turn Event Alerts on or off."

**CONFIRMED.** A subscription saved to iCloud appears on all her devices. `https://support.apple.com/en-us/102301`: "When you add a calendar subscription to iCloud on your iPhone, iPad, or Mac, you can see it across all of your devices."

**NOT FOUND.** The "Remove Alarms" setting in Apple's current iPhone documentation. A search limited to `support.apple.com` returned nothing for that phrase. The Mac guide page that should cover the Mac equivalent (`https://support.apple.com/guide/calendar/icl1022/mac`, "Subscribe to calendars on Mac") served only a contents shell to my requests and then a 429 error; a search summary of it says to "deselect the appropriate Remove checkboxes to get the calendar's event attachments or alerts" (**SNIPPET**).

**ANECDOTE.** A third-party guide dated 2 September 2013 documents the iPhone switch (`https://hebcal.com/home/?p=563`): "touch the Hebcal calendar and turn **Remove Alarms** to **On**". It does not give the default and is thirteen years old.

**ANECDOTE.** Apple Community, October 2017 (`https://discussions.apple.com/thread/8099710`): "on my iPhone, the events show up but do not have an alert associated with them." and "it works when I subscribe to a calendar on the device" but "if the subscribed calendar is from iCloud then it doesn't set up the alert/reminder."

**NOT FOUND.** Any Apple statement on whether alarms written in an ICS feed are honoured on iPhone, or on how often a subscribed calendar refreshes. Refresh lag matters here: a reminder added an hour before it is due may not have reached her phone.

### 4.2 Her own default alerts

**CONFIRMED.** Her phone can add its own alert to events. `https://support.apple.com/guide/iphone/change-calendar-settings-iphc37be2016/ios`:

> "Choose when to get alerts for different types of events: Tap Default Alert Times, tap Birthdays, Events, or All-Day Events, then choose an option."

**NOT FOUND.** Whether Default Alert Times apply to events in a subscribed or shared calendar. It is one setting for all timed events, so it cannot give each appointment its own reminder times.

### 4.3 Shared iCloud calendar

**CONFIRMED.** Sharing works by invitation. `https://support.apple.com/guide/iphone/share-icloud-calendars-iph7613c4fb/ios`: "Those you invite receive an invitation to join the calendar." and "When someone modifies a calendar you're sharing, you're notified of the change."

**ANECDOTE (Apple Community Specialist, 5 May 2022).** The sharer's alerts do not reach the other person. `https://discussions.apple.com/thread/253873425`:

> "When you share a calendar, the alerts do not get shared as well." / "Each person a Calendar is shared to can set up an alert."

**NOT FOUND.** An official Apple support article saying the same.

### 4.4 Event invitations

**CONFIRMED.** `https://support.apple.com/guide/iphone/reply-to-invitations-iphc0eddfe3c/ios`: "To respond to an event notification, tap it." and "To respond to an invitation you receive by email, tap the underlined text in the email, then tap Show in Calendar."

**NOT FOUND.** Whether an organiser's alert travels with an invitation. Each invitation also asks her to accept, which is a step she may not take.

### 4.5 Can software write events with alarms?

**CONFIRMED.** Google Calendar API reminders belong to whoever the software is signed in as. `https://developers.google.com/workspace/calendar/api/v3/reference/events`:

> reminders: "Information about the event's reminders for the authenticated user."

Methods: "popup | Reminders are sent via a UI popup." and "email | Reminders are sent via email." So reminders set by software reach her only if the software writes to her own Google account's calendar.

**CONFIRMED.** Apple lets third-party software sign in to iCloud calendar data with an app-specific password. `https://support.apple.com/en-us/102654`:

> "Some apps made by developers other than Apple ask you to sign in to your Apple Account, so that the app can access information like mail, contacts, and calendars that you store in iCloud."

> "Any time you change or reset your primary Apple Account password, all of your app-specific passwords are revoked automatically"

**NOT FOUND.** Apple developer documentation for iCloud's CalDAV service, and any Apple statement on whether an alarm written that way fires on her iPhone. Writing into her own iCloud calendar is the one calendar route where the alarm would be "hers", but that is untested and undocumented.

### 4.6 How noticeable, and Reminders lists

**NOT FOUND.** Any Apple comparison of a Calendar alert with a text message. A Calendar alert is an ordinary notification, subject to the same per-calendar Event Alerts switch and Focus settings above. It offers no delivery report and no way for her to reply.

**CONFIRMED.** Shared Reminders lists do not carry alerts to her. `https://support.apple.com/en-us/105124`:

> "Notifications that you set for your reminders aren't shared with anyone else."

The same page offers only list-activity notices: "Turn the notification option on or off for Adding Reminders and Completing Reminders."

---

## 5. WhatsApp Business Platform (Cloud API)

She would need WhatsApp installed and an account on her number. She does not have that by default, and it is a setup step for a person who is not confident with technology.

**CONFIRMED.** The platform terms are written for a company. `https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform`: "you" means "the company that you are authorized to represent"; "Company will only allow authorized individuals acting on behalf of Company to access and use the WhatsApp Business Platform."

**NOT FOUND.** A sentence that forbids an individual with no business from registering. The documentation neither permits nor excludes it in terms.

**CONFIRMED.** A new, unverified account can send, within a small limit that is ample here. `https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits`: "Newly created business portfolios have a messaging limit of 250." The limit counts "the maximum number of unique WhatsApp user phone numbers your business can deliver messages to" outside a customer service window in "a moving 24-hour period". "Verify your business" is listed as one way to raise the limit, not as a condition of sending.

**SNIPPET.** Meta's calling FAQ: "Business verification is not a requirement for calling, nor is it required for messaging." (page not opened).

**CONFIRMED.** Number rules, `https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers`: the number must "be able to receive voice calls or SMS", be "owned by you", and "Numbers already in use with WhatsApp cannot be registered unless they are deleted first."

**CONFIRMED.** Only marketing templates are blocked to US numbers. `https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits/`: "WhatsApp does not currently deliver marketing template messages to WhatsApp users with United States phone numbers". The page says nothing about utility templates. **SNIPPET** for the date: "Starting April 1, 2025, Meta does not deliver marketing messages sent to WhatsApp users in the United States (error code 131049)."

**CONFIRMED.** Pricing model, `https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing`: "Effective July 1, 2025 – Meta charges on a per-message basis"; "Utility – template messages for transactional or informational objectives"; utility messages inside an open customer service window "became free as of July 1, 2025" and the pricing type "changed from `free_customer_service` to `regular` as of October 1, 2026."

**NOT FOUND on the primary source.** The US utility rate. The pricing page links to rate-card files I could not read. Third-party sites give about $0.0034 per utility message for North America, with one outlier at $0.004; that is not evidence. At 40 messages a month the cost would be well under a dollar either way.

**Not verified today.** Delivery and read statuses and inbound replies by webhook.

---

## 6. Telegram, Signal, Messenger, email

### Telegram bot

She needs the Telegram app, an account, and to press Start once.

**CONFIRMED.** `https://core.telegram.org/bots`: "Bots can't start conversations with users. A user must either add them to a group or send them a message first."

**CONFIRMED.** Unattended sending is the intended use and is free. `https://core.telegram.org/bots/faq`: "By default, bots are able to message their users at no cost – but have limitations on the number of messages they can broadcast in a single interval". Replies reach the software: bots receive "All messages from private chats with users", by "Long polling and Webhooks".

**NOT FOUND.** A delivered or read signal for an ordinary bot's messages. The Bot API page mentions read state only for business accounts. The app would know Telegram accepted the message and nothing more unless she replies.

### Signal

She needs the Signal app and an account.

**CONFIRMED.** There is no official route for software. `https://github.com/AsamK/signal-cli`: "signal-cli provides an unofficial commandline, JSON-RPC and dbus interface for the Signal messenger." Upkeep: "signal-cli needs to be kept up-to-date to keep up with Signal-Server changes." and "The official Signal clients expire after three months and then the Signal-Server can make incompatible changes." Registration: "For registering you need a phone number where you can receive SMS or incoming calls."

**CONFIRMED.** Signal's terms name automated messaging as impermissible. `https://signal.org/legal/`: services must not be used in ways that "involve sending illegal or impermissible communications such as bulk messaging, auto-messaging, and auto-dialing."

**Would not load.** Signal's support article on third-party applications returned HTTP 403.

### Facebook Messenger

She needs a Facebook account and the Messenger app, and must message the Page first.

**CONFIRMED.** `https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy`: "For most user actions, it lasts 24 hours." and "Businesses have the duration of the standard messaging window to respond to a user." Outside it: "Message tags enable sending important and personally relevant updates to users outside the standard messaging window".

**SNIPPET; the Send API page returned only navigation to me.** The reminder tag is being withdrawn: requests with the CONFIRMED_EVENT_UPDATE, ACCOUNT_UPDATE and POST_PURCHASE_UPDATE tags "will return error code 100 starting April 27, 2026." If so, the tag that fitted reminders no longer works.

### Email with iOS Mail notifications

She needs nothing new if a mail account is already set up in Mail.

**CONFIRMED.** `https://support.apple.com/guide/iphone/set-email-notifications-iphc13a970c8/ios`:

> "You can set up mail notifications that let you know when you receive email messages in favorite mailboxes or from your VIPs."

> "Select the settings you want, like Alerts or Badges. When you turn on Alerts, you have the option to customize your sounds by changing the alert tone or ringtone."

**NOT FOUND.** Any way to confirm she saw an email. The sender learns only that her mail provider accepted it. Replies do work, since she can answer the email. The brief says she reliably notices texts, not email. I did not check email sending prices today.

---

## 7. RCS business messaging

**CONFIRMED.** Google's launch process assumes a brand with staff. `https://developers.google.com/business-communications/rcs-business-messaging/guides/launch/brand-verification`: the sender must give contact details for "an employee at the brand who has the authority to verify the agent information", and the brand must confirm that "you're permitted to manage the agent on their behalf."

**SNIPPET.** Google's acceptable use policy: "When creating an agent(s), you must use the legal business name (e.g., XYZ Company LLC) of the brand that owns the such agent(s)." Twilio's US guide asks for "a US EIN or FTIN under which your business was registered" (the Twilio Help Center page returned only its title to me).

**NOT FOUND.** A sentence that says "individuals may not". Every requirement I found presumes a registered business, so the expected answer stands: not open to an individual with no business.

---

## 8. Purpose-built devices and services that software can drive

**CONFIRMED.** Pushover (an app with a sending API). She needs the app installed and signed in. `https://pushover.net/api`: emergency-priority notifications "are repeated until the notification is acknowledged by the user"; receipts "can be used to get the status of a notification and find out whether it was acknowledged"; an optional callback is "a publicly-accessible URL that our servers will send a request to when the user has acknowledged your notification"; "Each account is permitted to send 10,000 messages per month for free". Price, `https://pushover.net/pricing`: "$4.99 USD one-time purchase" after a trial that is "free for 30 days". **NOT FOUND** on those two pages: whether it can sound through silent mode or a Focus on iPhone. This is the only channel I found with a built-in "she acknowledged it" signal, but it has no free-text reply and it needs an app.

**CONFIRMED.** Alexa Reminders API cannot be driven unattended. `https://developer.amazon.com/en-US/docs/alexa/smapi/alexa-reminders-overview.html`: "A skill requires explicit customer permission to create reminders." and "You can't use an out-of-session token to create a reminder". When a reminder is due "Alexa plays a brief tone on the customer's Alexa-enabled device" and "The reminder repeats twice unless the customer says, "Stop.""

**CONFIRMED.** Alexa Proactive Events API can be sent by a server but only as a notification she must have opted in to. `https://developer.amazon.com/en-US/docs/alexa/smapi/proactive-events-api.html`: "To subscribe to proactive events, the customer must first enable Notifications in the Alexa app for your skill." and "You can choose the proactive event schemas that you want to support from a list of pre-defined schemas." **NOT FOUND:** that Alexa speaks the event aloud unprompted.

**Not researched.** Reminder clocks, smart displays other than Echo, and caregiver apps. I ran out of scope before checking any of them for an API, so I list none.

---

## Verdict for this part

Ranked for this recipient against the four wants: (1) goes out unattended and she notices, (2) the app can tell it was delivered, (3) her replies reach the family, (4) low cost.

**1. Automated voice call from a number saved in her Contacts.** The only non-SMS channel that needs nothing installed and that an individual can lawfully use with her consent.

- On her phone: a family member saves the calling number as a contact once (Apple: "This way, you always see these calls"), optionally with the emergency-contact allowance so it sounds through silent mode and Focus.
- Legal: her prior express consent, which may be oral; the message must open with who is calling and give a phone number.
- Delivery: answered, no answer, busy or failed per call; human versus voicemail with answering machine detection, imperfectly. Can leave a voicemail.
- Replies: none in words. A keypress confirmation is plausible but not verified here.
- Cost: about $1.70 to $2.00 a month on Twilio at 40 calls; Plivo is cheaper per minute and per number.
- Main ways of failing: an individual cannot get A attestation, Voice Integrity or caller name on Twilio as documented, so the number is unbranded with C attestation and a carrier may label it spam, and Apple says carrier-flagged calls "are silenced, sent to voicemail, and moved to the Spam list". She may also simply not pick up, and a reminder spoken once is gone unless it lands in voicemail. AWS voice is not an escape: its US voice numbers sit behind the same 10DLC or toll-free registration.

**2. Calendar events with alerts, as a free second channel, never the only one.**

- On her phone: a one-time subscription or share accepted by a family member, Event Alerts on for that calendar, and possibly Default Alert Times.
- Delivery: none reported. Replies: none. Cost: nothing.
- Main ways of failing: Apple does not document that alarms in a feed fire on iPhone; a shared calendar's alerts do not reach her; default alerts are one setting for every event; subscribed calendars refresh on a schedule Apple does not state. Writing events into her own iCloud calendar by software is the most promising variant and the least documented. It needs a test on her actual phone before anyone relies on it.

**3. Web push from the installed PWA.**

- On her phone: Add to Home Screen, then one tap on a permission prompt, both of which a family member can do for her.
- Delivery: only "accepted by Apple" (201) or "subscription dead" (410). Replies: only by opening the app. Cost: nothing.
- Main way of failing: silently. Developers report subscriptions dying after days or weeks with no error, a WebKit engineer confirmed bugs of that kind, and nobody is told when it happens. A Focus silences it. Not fit to be the main channel for someone who will not notice that reminders have stopped.

**4. Pushover, or a Telegram bot.** Both are sanctioned for unattended sending and cheap ($4.99 once; free).

- On her phone: an app installed and signed in, which the brief names as a risk. Telegram also needs her to press Start.
- Pushover gives a real acknowledgement signal and repeats until she responds, but no reply in words. Telegram gives replies but no delivered or read signal.
- Main way of failing: the app gets signed out, deleted, or its notifications switched off, and she cannot fix it.

**5. Email with a Mail alert.** Nothing to install and replies work, at negligible cost. It fails want 1: she is known to notice texts, not email, and there is no delivery-to-eyes signal.

**6. WhatsApp Cloud API.** Utility templates to a US number are still delivered and an unverified account's limit of 250 recipients a day is plenty, at well under a dollar a month. It needs WhatsApp on her phone, template approval, and an account under terms written for a company. The US price is unconfirmed on the primary source.

**Not usable.**

- Apple Messages for Business: needs a company, an approved provider and live agents; the customer must start the conversation.
- RCS business messaging: every requirement presumes a registered business.
- Facebook Messenger: 24-hour window, and the reminder tag appears to have been withdrawn in April 2026.
- Signal: unofficial client only, and the terms forbid auto-messaging.
- Shared Reminders lists: "Notifications that you set for your reminders aren't shared with anyone else."
- Alexa: reminders cannot be created by a server; proactive events are an opt-in notification on a device she would have to own.

**Open questions that would change the ranking.** Whether a saved contact overrides the carrier spam filter; whether her carrier labels an unregistered number as spam in practice; whether an alarm written into her own iCloud calendar fires on her phone. Each is a short test on her actual iPhone.
