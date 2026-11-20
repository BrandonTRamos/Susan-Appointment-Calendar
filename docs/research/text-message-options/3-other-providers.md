# Research part 3: every other provider with an API that can text a US mobile number

Researched 19 November 2026. Twilio and AWS are left out (covered elsewhere).

Labels: **CONFIRMED** = I read it on the provider's own page today. **ANECDOTE** = a first-hand report, not evidence of policy. **NOT FOUND** = I looked and the source does not say, or the page would not load (named where so).

## Comparison table

| Provider                                                                 | Sole Proprietor 10DLC with no EIN                                                                                 | Stance on personal / non-business use                                                                           | Toll-free for an individual                                                                            | Delivery receipts                                                                   | Replies                                        | One-time cost                                               | Monthly cost                                                                           |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Textbelt**                                                             | Not needed: customer does no registration; sends from Textbelt's shared number pool                               | Allowed in its own words: sender may be a "person"; "Indicate your name or business"                            | Not applicable                                                                                         | Yes, by polling `/status/:textId` (no delivery webhook documented); carrier caveats | Yes, webhook, US numbers only, paid keys only  | None                                                        | None. Prepaid: $3/50, $5/200, $10/700 texts                                            |
| **YouGot** (consumer reminder service, sends under its own registration) | Not needed                                                                                                        | Allowed: "intended for personal and legitimate business reminder use"; "remind someone else" is a feature       | Not applicable                                                                                         | NOT FOUND (webhook channel exists on Business tier)                                 | Yes, two-way SMS commands (DONE, SNOOZE, STOP) | None                                                        | API only on Business, $79.99/mo; Pro $9.99 (30 SMS), Plus $24.99 (100 SMS) have no API |
| **Blooio** (iMessage relay, not SMS)                                     | Not needed                                                                                                        | Has a plan labelled "Personal use"                                                                              | Not applicable                                                                                         | Yes ("Delivery Reports")                                                            | Yes (webhooks)                                 | None                                                        | $39/mo Starter, shared number, 5 new conversations/day                                 |
| **Vonage**                                                               | Yes. "Limited to entities without EIN / Tax ID"; examples given: "Developer testing account, Single individual"   | No refusal found; docs name individuals                                                                         | Sole proprietorship "may apply without an EIN/CBN" with extra checks                                   | Not checked                                                                         | Not checked                                    | $4 brand (search snippet only; support page would not load) | NOT FOUND                                                                              |
| **Telnyx**                                                               | Yes, since 4 Feb 2026                                                                                             | No statement either way. Guide requires "a single individual operating a business"                              | Sole Proprietor type exempt from registration number, but "can now be subject to Manual Verification"  | Yes, `message.finalized` webhook                                                    | Yes, `message.received` webhook                | $4.50 brand + $15 campaign vetting                          | $2 campaign + $1 number                                                                |
| **Sinch**                                                                | Yes per Sinch's own overview PDF                                                                                  | NOT FOUND                                                                                                       | "Additional vetting"; approval "not necessarily guarantee" (search snippet; page would not load)       | Not checked                                                                         | Not checked                                    | $4 brand                                                    | $2 campaign                                                                            |
| **Plivo**                                                                | No. Brand API allows `STANDARD` only, "Requires a profile that contains an EIN". Starter paused since 19 Oct 2022 | NOT FOUND                                                                                                       | Form has entity type "Individual", but asks for EIN matching government documents                      | Not checked                                                                         | Not checked                                    | n/a                                                         | n/a                                                                                    |
| **ClickSend**                                                            | No. 10DLC requires "your Employer Identification Number (EIN)"                                                    | NOT FOUND                                                                                                       | Sole proprietor without a registration number may apply; "Additional vetting"; approval not guaranteed | Not checked                                                                         | Not checked                                    | n/a                                                         | n/a                                                                                    |
| **TextMagic**                                                            | No. "If you are a sole proprietor without an EIN, please switch to toll-free texting"                             | NOT FOUND                                                                                                       | Form asks for "Business registration number (EIN)"; verification is free                               | Not checked                                                                         | Not checked                                    | TFV free                                                    | NOT FOUND                                                                              |
| **SignalWire**                                                           | No. Brand API requires `ein`; entity types are company types only                                                 | NOT FOUND                                                                                                       | No. "Sole Proprietor is no longer accepted for toll-free verification"                                 | Not checked                                                                         | Not checked                                    | n/a                                                         | n/a                                                                                    |
| **Bandwidth**                                                            | No. "As of November 1, 2022, you can no longer register Sole Proprietor brands"                                   | NOT FOUND                                                                                                       | "Business Registration Numbers (BRNs) are mandatory"                                                   | Not checked                                                                         | Not checked                                    | n/a                                                         | n/a                                                                                    |
| **Bird (MessageBird)**                                                   | No. "Sole proprietor brands can't be registered."                                                                 | NOT FOUND                                                                                                       | NOT FOUND                                                                                              | Not checked                                                                         | Not checked                                    | n/a                                                         | n/a                                                                                    |
| **Infobip**                                                              | No path shown: 10DLC brand needs Tax ID, "Nine-digit Employer Identification Number (EIN) from IRS"               | NOT FOUND                                                                                                       | NOT FOUND                                                                                              | Not checked                                                                         | Not checked                                    | n/a                                                         | n/a                                                                                    |
| **Flowroute (BCM One)**                                                  | No. "does not accept new setups of the campaign Use Case 'Sole Proprietor.'"                                      | **Refused in writing**: "Flowroute only allows messaging for business purposes on its platform."                | Not checked                                                                                            | Not checked                                                                         | Not checked                                    | n/a                                                         | n/a                                                                                    |
| **Telgorithm**                                                           | Not relevant                                                                                                      | Not for individuals: "minimum monthly send for SMS and/or MMS is 500,000"                                       | Not checked                                                                                            | Not checked                                                                         | Not checked                                    | n/a                                                         | n/a                                                                                    |
| **Voip.ms**                                                              | NOT FOUND: wiki blocked (HTTP 403). Blog lists "Tax ID (EIN)" as required                                         | NOT FOUND on a primary page                                                                                     | NOT FOUND                                                                                              | NOT FOUND                                                                           | NOT FOUND                                      | NOT FOUND                                                   | NOT FOUND                                                                              |
| **SMS by Zapier**                                                        | Not needed (Zapier's number)                                                                                      | "sending text messages to yourself or your team"; runs on Twilio and must comply with Twilio's messaging policy | n/a                                                                                                    | NOT FOUND                                                                           | NOT FOUND                                      | None                                                        | Zapier plan                                                                            |
| **IFTTT SMS**                                                            | Not needed                                                                                                        | "send text messages to your phone"; cap "100 SMS messages per month" in US                                      | n/a                                                                                                    | NOT FOUND                                                                           | Tagged inbound messages can start automations  | None                                                        | IFTTT plan                                                                             |

"Not checked" for delivery receipts and replies means I did not spend a fetch on it because the provider has no registration route open to this person, so the question is moot.

## Pages that would not load

- Vonage support articles `api.support.vonage.com/hc/en-us/articles/360052940172` (brand registration guide) and `.../6030271005468` (Sole Proprietor v2 update): HTTP 403. Vonage's developer docs loaded and are used instead.
- Sinch community `community.sinch.com/t5/Compliance-Centre/How-to-create-a-sole-proprietor-brand-for-10DLC/m-p/19740` and Sinch support `support.app.sinch.com/hc/en-us/articles/13723595338255`: HTTP 403.
- Voip.ms wiki `wiki.voip.ms/article/10DLC_Business_Text_Messaging_Regulations_and_Requirements` and `wiki.voip.ms/article/SMS-MMS`: HTTP 403 (bot challenge), also through a reader proxy.
- Reddit search and Trustpilot: HTTP 403. No Reddit thread could be read, so there are no Reddit anecdotes below.
- Plivo `plivo.com/blog/10dlc-starter-paused`: HTTP 404. The pause is confirmed from other Plivo pages.
- `textbelt.com/terms`: 404. The real terms page is `textbelt.com/tos/`.

---

## 1. Textbelt (items 1 to 7)

**How it sends to US numbers.** CONFIRMED. https://docs.textbelt.com/llms-full.txt (FAQ, "How do I send texts from a specific phone number?"): "Textbelt SMS are sent from a very large shared pool of phone numbers. Whenever possible, our service makes sure that you are represented to your recipients as a single unique phone number." Same page: "Textbelt.com is a service that costs money because we pay carriers around the world to accept and deliver SMS. It does not use potentially unreliable email-to-SMS gateways."

**Whether those pool numbers are 10DLC or toll-free, and how they are registered.** NOT FOUND. Neither the docs, FAQ, terms nor homepage mentions 10DLC, toll-free verification or The Campaign Registry. The only registration statement is for other countries: "Some countries require pre-registration and approval of SMS use cases, which we can facilitate."

**What it requires of the customer.** CONFIRMED. No registration form, no business details. Purchase page https://textbelt.com/purchase/ asks only for an API key and payment: "This is a one-time charge. By purchasing you are bound by our Terms of Service." Requirements in the terms, https://textbelt.com/tos/:

- "The recipients of your texts must have explicitly opted into receiving your messages. Textbelt is not for bulk advertising or spam. ... You are expected to retain opt-in records."
- "You must identify yourself. Indicate your name or business in your SMS."
- "If you are sending recurring SMS, provide opt-out instructions. We automatically process STOP responses."
- "Sending text messages containing URLs requires account activation." and "Shortened URLs (bit.ly, tinyurl, etc) are prohibited".

**Stance on personal use (the key question).** CONFIRMED that an individual sender is contemplated; nothing refuses personal use.

- https://textbelt.com/tos/: "Indicate your name or business in your SMS."
- https://docs.textbelt.com/llms-full.txt (Compliance): 'A "sender name" is the name of the business, organization, or person you're representing when you send an SMS. _Every SMS conversation must include the sender name_.'
- Same file, Textbelt's own blog post: "If you're just texting yourself from the command line ... you may use Textbelt's hosted service".
- Counterpoint on the same docs page (Getting started): "Regulations require that you state the name of your business/organization in SMS messages." That sentence does not mention a person.
- No sentence anywhere says "personal use is permitted" in those words. NOT FOUND for an explicit grant.

**What Textbelt adds to messages.** CONFIRMED. Compliance section: "If an SMS message does not contain your sender name the first time you message someone, the sender name will be automatically appended to your message." and 'The standard form of opt-out is "Reply STOP to unsubscribe". This opt-out is appended automatically the first time you message a new user.'

**Delivery status.** CONFIRMED, by polling, not webhook. "send an HTTP GET request to `https://textbelt.com/status/:textId`". Values: "`DELIVERED` - Carrier has confirmed sending", "`SENT` - Sent to carrier but confirmation receipt not available", "`SENDING`", "`FAILED` - Not received", "`UNKNOWN`". "Delivery statuses can be retrieved up to 1 week after the message was sent." Caveat in bold on the page: "Delivery statuses are not standardized between mobile carriers. Some carriers will report SMS as "delivered" when they attempt transmission to the handset ... Some carriers do not have a way of tracking delivery, so all their messages will be marked "SENT"." A delivery-status webhook: NOT FOUND.

**Replies.** CONFIRMED. "**U.S. phone numbers only:** Textbelt lets you receive replies to SMS you've sent. Replies are sent by webhook". "Add a `replyWebhookUrl` parameter to your send message request." Payload has `fromNumber` and `text`; requests carry an `X-textbelt-signature` header. "SMS replies cannot be received on the free `textbelt` key."

**Price.** CONFIRMED from the site's pricing data, https://textbelt.com/js/base_pricing.js, US/Canada (`NA`): $3 for 50 texts, $5 for 200, $10 for 700, $23 for 1,700, $45 for 3,500. That is 6.0, 2.5 and 1.4 cents a text. No monthly fee: homepage https://textbelt.com/ "No recurring billing, unnecessary add-ons, or client libraries." Free key: "use `key=textbelt` to send 1 free text per day." Quota counts segments: "Textbelt quota corresponds to the number of SMS segments that you send." Expiry: "it will expire if 365 days go by without any usage on your key." Failed texts are still charged: "we can't retroactively refund texts that aren't successfully delivered."

**Reliability claims.** CONFIRMED that Textbelt makes modest claims and publishes no delivery figures.

- FAQ: "Server and API uptime are tracked on our Status Page. Text delivery stats are not dashboarded because failed texts may also be caused by users (eg. invalid phone numbers)."
- FAQ: "No, you may not offer emergency services through Textbelt, or any service that impacts life safety. Textbelt is not reliable enough for these purposes and cannot accept this liability."
- Homepage: "For a reliable, zero-setup solution that works with mobile networks, create an API key."
- "Textbelt does not support sending SMS to VOIP numbers." (not an issue for a carrier iPhone).
- Operator: https://textbelt.com/about/ "owned and operated by Alioth LLC since 2012".

**Account without a company.** CONFIRMED. An API key is created on the purchase page with a card or PayPal; no business fields.

**Open risks I could not close from primary sources.** The sender number comes from a shared pool and may not always be the same number ("Whenever possible"). How the pool is registered with carriers is undisclosed, so there is no way to check from the outside that an appointment reminder to a family member falls inside whatever campaign those numbers carry.

## 2. Telnyx

**Sole Proprietor without EIN.** CONFIRMED. https://developers.telnyx.com/docs/messaging/10dlc/sole-proprietor.md: "Sole Proprietor registration enables individuals and small businesses without a federal Tax ID (EIN) to register for 10DLC messaging." Launched 4 Feb 2026 (https://telnyx.com/release-notes/10dlc-sole-proprietor-support).

**Eligibility wording.** CONFIRMED. https://support.telnyx.com/en/articles/13545282-guide-to-sole-proprietor-10dlc-brand-and-campaign-registration: "For small business owners and freelancers without a federal Tax ID (EIN)". Criteria: "You do not have an EIN", "You are a single individual operating a business.", "You require low-volume messaging (typically 1,000 messages per day)."

**Form.** CONFIRMED, same guide: "Legal Name: Your full name as it appears on government-issued ID."; "Email Address: A permanent business or personal email (free providers like Gmail are permitted for Sole Proprietors...)"; "Mobile Phone Number"; "Physical Address: Your primary residence or business location (PO Boxes/PMBs are not accepted)."; "Website or Social Media: A URL (e.g., LinkedIn, professional Facebook page, or business website) that demonstrates your business's legitimacy." Developer doc prerequisites: "Personal information: name, address, date of birth". Identity check by one-time PIN to the mobile number, to be completed within 24 hours.

**Disqualifying words.** CONFIRMED. A legal name or website containing terms such as "LLC, Inc", "Health", "Home", "Software", ".org", ".ai" "does NOT qualify as a Sole Proprietor".

**Fees.** CONFIRMED, developer doc: "Brand Registration | $4.50 | One-time", "Campaign Vetting | $15.00 | Per submission", "Monthly Maintenance | $2.00 | Monthly". Number: https://telnyx.com/pricing/messaging "$1.00 / NUMBER/MO"; messages "$0.004 a part. Then the carrier, at cost."

**Limits.** CONFIRMED. One campaign, one number, "Max 3 SP brands per mobile number". https://developers.telnyx.com/docs/messaging/10dlc/10dlc-rate-limits.md: AT&T class "W | Sole Proprietor | N/A | 15" SMS per minute; T-Mobile daily cap "Sole Proprietor | N/A | 1,000".

**Personal use.** NOT FOUND, for or against. The guide, developer doc, use-case page and forbidden-use-case article (https://support.telnyx.com/en/articles/14286763) say nothing about messaging family, friends or yourself. The nearest text is the P2P definition in https://support.telnyx.com/en/articles/3679260-frequently-asked-questions-about-10dlc: "P2P: Person-to-person. Messaging that is sent manually from one person's phone to another, and is not on behalf of a business." and the P2P exemption requires "All messages are written and sent by individuals to other individuals", which automated reminders do not meet.

**Toll-free.** CONFIRMED. https://developers.telnyx.com/docs/messaging/toll-free-verification.md: registration-number fields are "required for all new toll-free verification requests unless `entityType` is `SOLE_PROPRIETOR`"; `SOLE_PROPRIETOR` = "Individual or sole proprietorship". But https://support.telnyx.com/en/articles/13765655: "carriers now strongly prefer—and often mandate—an Employer Identification Number (EIN) for all Toll-Free verifications" and "Submissions without an EIN (using the SOLE_PROPRIETOR classification) can now be subject to Manual Verification. This involves uploading a government-issued ID and sometimes a "live selfie"". The submission guide still needs an opt-in link and "website Privacy Policy and Terms & Conditions pages". TFV fee: NOT FOUND.

**Receipts and replies.** CONFIRMED. https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks.md: "`message.finalized` | An outbound message has reached a terminal state (delivered, failed, etc.)" and "`message.received` | An inbound SMS/MMS arrives at your number".

**Unregistered sending.** CONFIRMED not possible. FAQ: "From February 3rd 2025, any 10DLC traffic which is not registered will be blocked altogether."

**Account without a company.** CONFIRMED there is friction. https://support.telnyx.com/en/articles/5295540-how-to-sign-up-for-a-telnyx-account: "It is mandatory for users to have a business email address to create or sign up for a new account as certain free email providers are disallowed". The same page offers "Single Sign On with Gmail & Microsoft" and says a KYC identity check may be required.

## 3. Vonage

**Sole Proprietor without EIN.** CONFIRMED. https://developer.vonage.com/en/messages/10-dlc/campaign-overview, use-case table: "Sole Proprietor | Limited to entities without EIN / Tax ID. | Developer testing account, Single individual | 1 Campaign & maximum of 5 numbers, no political campaigns allowed".

**Form.** CONFIRMED. https://developer.vonage.com/en/messages/10-dlc/brand-overview: Entity Type is "Business type behind the brand. Is this a form of business or individual/freelance developer?"; "for all companies other than individuals an EIN is required." Fields include Website URL ("The website of the business"), Vertical, Email, Display Name, Company Name, Phone, address.

**Personal use.** NOT FOUND as an explicit statement. The docs name "Single individual", "individual/freelance developer" and "Developer testing account" as intended registrants, which is the friendliest wording of any 10DLC provider read. Nothing about family or friends.

**Fees and one-time passcode.** NOT FOUND today: the support articles returned HTTP 403. A search-result snippet of those pages says "The Sole Proprietor brands now includes a registration fee of $4" and that a one-time passcode to a mobile phone is required; I did not read the page.

**Toll-free.** CONFIRMED. https://developer.vonage.com/en/tfn-registration/guides/register-a-tfn: "Sole Proprietorship may apply without an EIN/CBN, but there will be additional checks to validate that the provided information is accurate" and "For Sole Proprietorship, you may leave this field blank".

**Receipts, replies, unregistered sending, account opening.** Not checked / NOT FOUND.

## 4. Sinch

**Sole Proprietor.** CONFIRMED in Sinch's own overview deck, https://sinch.com/wp-content/uploads/pdf/Sinch-A2P-10DLC-Overview.pdf: "Sole proprietors: First and Last name, email address, billing address (including country), business phone and mobile phone (note: all SP brands must pass validation/verification in TCR..." and "Sole proprietor | Limited to entities without an EIN/Tax ID". Fees: "NRC $4 per brand", "MRC $2 for sole proprietor campaigns". Throughput class W is "Very small business/sole proprietor individuals/groups that do not fall into any other class". The deck is undated and its newest date reference is "Starting December 1, 2024", so current availability is not proven.
**API.** CONFIRMED the registration API reference (https://developers.sinch.com/docs/10dlc-registration/api-reference/10dlc-registration.md) does not mention sole proprietor.
**Personal use, toll-free, account opening.** NOT FOUND (community and support pages returned 403).

## 5. Plivo

**Sole Proprietor.** CONFIRMED not available. https://www.plivo.com/docs/messaging/api/10dlc/brand.md: "**brand_type** ... Allowed values: `STANDARD`. Requires a profile that contains an EIN." https://www.plivo.com/blog/starter-10dlc/: "As of October 19, 2022, Plivo has paused Starter registrations." Legacy doc: "We have paused support for Starter brands."
**Conflict.** Plivo's blog https://www.plivo.com/blog/10dlc-registration still lists "It costs $4 for sole proprietors" and "Sole proprietor campaigns: $0.75 per month", and the Profile API allows `entity_type=INDIVIDUAL` ("you can skip fields like `ein`"). The Brand API then refuses a profile without an EIN.
**Toll-free.** CONFIRMED. https://www.plivo.com/docs/messaging/concepts/toll-free-registration-guidelines.md: entity type "Individual | for individuals operating without a formally registered business entity"; but the same form says "EIN: Your business registration number must match exactly what appears on official government-issued documents", and the page opens "Any business submitting a toll-free number". Terms and Privacy URLs required "since September 7, 2026".
**Personal use.** NOT FOUND.

## 6. SignalWire

**Sole Proprietor.** CONFIRMED not available. https://signalwire.com/docs/apis/rest/campaign-registry/brands/create-brand.md: "`legal_entity_type` (enum, required) ... Allowed values: `PRIVATE_PROFIT`, `PUBLIC_PROFIT`, `NON_PROFIT`, `GOVERNMENT`" and "`ein` (string, required) — Company EIN Number/Tax ID."
**Stance.** CONFIRMED business-only framing. https://signalwire.com/docs/platform/messaging/campaign-registry/registration.md: "Any business using an application platform (e.g., SignalWire) to send messages from a local phone number must register with TCR, regardless of use case." Nothing on personal use.
**Toll-free.** CONFIRMED refused. https://signalwire.com/docs/platform/messaging/toll-free-numbers.md: "Sole Proprietor is no longer accepted for toll-free verification. An EIN or other business registration number is now required."

## 7. Bandwidth

CONFIRMED refused. https://www.bandwidth.com/support/en/articles/12823082: "As of November 1, 2022, you can no longer register Sole Proprietor brands through Bandwidth." https://www.bandwidth.com/support/en/articles/12823085: "Bandwidth is not supporting Sole Proprietor use cases at this time". Toll-free, https://www.bandwidth.com/support/en/articles/12823247: "Business Registration Numbers (BRNs) are mandatory." Personal use: NOT FOUND.

## 8. Bird (MessageBird)

CONFIRMED refused. https://bird.com/docs/guides/sms/10dlc: "You can register a private company, public company, non-profit, or government entity. Sole proprietor brands can't be registered." Older `docs.bird.com` pages now redirect to `bird.com/docs`. Toll-free and personal use: NOT FOUND.

## 9. Infobip

CONFIRMED that a 10DLC brand needs an EIN. https://www.infobip.com/docs/10dlc/brands: "Tax ID | Yes" and "United States | Nine-digit Employer Identification Number (EIN) from IRS. Must match your legal company name and IRS registration address exactly." The page read today does not contain the word "proprietor"; a search-result snippet attributed to it says "Infobip currently does not support sole proprietor brands", which I could not see on the page. Toll-free and personal use: NOT FOUND.

## 10. ClickSend

**10DLC.** CONFIRMED EIN required. https://help.clicksend.com/en/articles/43423-step-by-step-registration-process-for-10dlcs: "you must provide the following information: a business website, a business email, links to Terms & Conditions and Privacy Policy, and your Employer Identification Number (EIN)."
**Toll-free.** CONFIRMED. https://help.clicksend.com/en/articles/67758-toll-free-number-business-registration-requirement: "As of February 17th 2026, business registration numbers will become mandatory for all new toll-free number submissions."; "If no EIN is available (e.g., a self-run business or sole prop with no employees), additional vetting will be required upon review. Approval is not necessarily guarantee if a business is classified as sole-proprietor."; "If you are a self-run business or sole proprietor without a BRN you may indicate that you have no BRN through the application."
**Personal use.** NOT FOUND (the acceptable-use URL I tried returned 404).

## 11. TextMagic

**10DLC.** CONFIRMED EIN required. https://support.textmagic.com/?p=7136: "If you are a sole proprietor without an EIN, please switch to toll-free texting."
**Toll-free.** CONFIRMED mixed. https://support.textmagic.com/article/sending-text-messages-to-the-usa-and-canada/: "Toll-free number verification is free. It usually takes up to 5 business days."; legal form options include "Sole Proprietorship"; but "Business registration number (EIN): Provide your tax or registration ID in the correct format (XX-XXXXXXX)." and the contact email "must be associated with your brand by domain or prefix". https://www.textmagic.com/toll-free-texting/ lists as a reason to choose toll-free: "Your organization has a tax ID (EIN)." Whether a blank EIN is accepted: NOT FOUND.
**Personal use.** NOT FOUND in the terms of service.

## 12. Flowroute (BCM One)

CONFIRMED refused, in the plainest words of any provider. https://support.bcmone.com/flowroute-support/docs/10dlc-messaging-submission-faq:

- "Flowroute only allows messaging for business purposes on its platform."
- Q: "How do I register if I only use messaging services to send personal text messages or if I don't have an EIN?" A: "Personal text messaging (P2P: person-to-person) isn't currently supported via Flowroute. Only A2P (application-to-person) is presently available."
- "BCM One does not accept new setups of the campaign Use Case "Sole Proprietor."" and "If the customer does not have an EIN, they can register for one. ... this is the only way we can serve your SMS service."
- Unregistered sending, https://support.bcmone.com/docs/messaging-guidelines-start-here-with-10dlc.md: "Effective April 17th, 2024, Flowroute blocks all outbound messages from unregistered 10DLC numbers."

## 13. Telgorithm

CONFIRMED unsuitable. https://www.telgorithm.com/pricing: "Our minimum monthly send for SMS and/or MMS is 500,000." Sole proprietor registration and personal use: NOT FOUND.

## 14. Voip.ms

NOT FOUND for almost everything: the wiki, where its 10DLC rules and fees live, returned HTTP 403 on every attempt. What loaded, https://voip.ms/blog/sms-registration/, is written for businesses: "Even if you're not a high-volume sender, SMS traffic through 10DLC still requires registration. Whether you're sending appointment reminders, login codes, or promotional alerts — it all qualifies." It lists "Tax ID (EIN)" as needed for brand registration and warns against "Using generic domains or emails (e.g., Gmail)". A search-result snippet of the wiki mentions a "Sole Proprietor $2.00" fee line; I could not read the page. ANECDOTE (older, not 2026, from search snippets of dslreports and voip-info forum threads, not read in full): users reported personal texting kept working without registration in 2023, and that API sending was capped at 100 a day.

## 15. Others found that welcome individuals

**YouGot** (https://www.yougot.ai), a consumer reminder service. CONFIRMED:

- Sends to another person: https://www.yougot.ai/blog/technology/app-comparisons/reminder-apps-that-send-sms-to-others "You set up a reminder with YouGot from your own account, enter the recipient's phone number, and the SMS goes directly to their phone. They don't need an account".
- Terms, https://www.yougot.ai/terms-and-conditions: "The Service is intended for personal and legitimate business reminder use."
- Trigger: REST API and webhooks only on Business. https://www.yougot.ai/pricing: Business "$79.99 /mo", "Create and manage reminders through the REST API", "Scheduled webhooks connect reminders to your tools", "Up to 300 SMS". Pro "$9.99 /mo", "Up to 30 SMS"; Plus "$24.99 /mo", "100 SMS", "Up to 5 connected phone numbers". Terms: "API access is available exclusively to Business tier subscribers".
- Consent step: https://www.yougot.ai/sms-terms: the number is added in the dashboard, a consent box is ticked, and 'Click "Send Code" to receive a 6-digit verification code via SMS'. The family member would have to read out that code once.
- Replies: "YouGot supports two-way messaging via SMS and WhatsApp" with commands such as "DONE #", "SNOOZE", "STOP". Whether a reply or a delivery status is passed to the customer's own webhook: NOT FOUND.
- Limits and guarantees: "When SMS or WhatsApp limits are reached, delivery on those channels stops; email fallback is attempted but not guaranteed"; "delivery through any channel is not guaranteed." Operator: "Foresight AI Partners LLC". WhatsApp goes "through Twilio"; which carrier route SMS uses: NOT FOUND.
- Note: YouGot does its own scheduling, so it would duplicate rather than serve the app's scheduler unless the API is used.

**Medication Call Reminder** (https://medicationcallreminder.com/). CONFIRMED: "Personalized voice call and SMS medication reminders for seniors and family caregivers"; "Standard Plan: $9.99/month | Family Plan: $14.99/month". API, Zapier or email trigger: NOT FOUND.

**SMS by Zapier.** CONFIRMED. https://zapier.com/blog/sms-by-zapier-guide: "a built-in tool for sending text messages to yourself or your team"; "The tool is powered by Twilio"; "Since we use Twilio, texts have to comply with their messaging policy"; "Messages can only be sent to numbers in the US and UK"; "verifying each phone number with a PIN"; "no more than 15 per hour across your entire Zapier account"; "up to 153 characters". Trigger: any Zap trigger (schedule, webhook). Replies and delivery status: NOT FOUND. Because it rides on Twilio, it inherits the Twilio policy that started this research.

**IFTTT SMS.** CONFIRMED. https://ifttt.com/sms: "send text messages to your phone and start automations when you receive tagged messages"; "a cap of 100 SMS messages per month for users in the US and Canada"; "Messages sent must adhere to IFTTT's message guidelines". It texts the account's own verified phone, so the account would have to be set up on the family member's number. Delivery status: NOT FOUND.

**Blooio** (iMessage relay; the recipient has an iPhone). CONFIRMED. https://blooio.com/pricing: plan "Starter | Personal use", "$39 /mo", number type "Shared", "5 /day" new conversations, with "Scheduled Messages", "Delivery Reports", "API Access", "Webhooks". Terms, https://blooio.com/terms: "third-party platforms (such as Apple iMessage, Mac, or iPhone) may prohibit automated access ... It is your responsibility to comply with such restrictions"; "We target 99.9% uptime as an operational objective, not a contractual service-level agreement". These arrive as iMessages, not SMS, and the terms themselves flag that Apple may not permit the method.
**LoopMessage.** CONFIRMED prices only, https://loopmessage.com/pricing: "Light ... from $59.99 /month per sender", "Phone number ... +$15/mo", "Init conversations ... +$30/mo".
**Sendblue.** CONFIRMED prices only, https://www.sendblue.com/pricing: "Free Sandbox" with "No webhooks or callbacks"; production "$100 /month" per line.

**A phone or modem on a consumer plan** (not a provider API). See anecdotes; no primary source says a carrier permits automated sending on a consumer plan.

**Carrier email-to-text gateways.** NOT FOUND on any carrier page. Secondary sources (vendor blogs and a university IT notice in search results) say AT&T ended its gateway on 17 June 2025 and that T-Mobile's and Verizon's have stopped or degraded. Textbelt's own docs call these gateways "potentially unreliable". Not a route.

## 16. Toll-free verification across providers (item 3)

CONFIRMED pattern: since early 2026 a business registration number is mandatory for companies, and "sole proprietor" is the only class that may omit it, at the price of extra vetting.

- Telnyx: required "unless `entityType` is `SOLE_PROPRIETOR`"; may need government ID and "live selfie".
- Vonage: "Sole Proprietorship may apply without an EIN/CBN, but there will be additional checks".
- ClickSend: "Approval is not necessarily guarantee if a business is classified as sole-proprietor."
- SignalWire: "Sole Proprietor is no longer accepted for toll-free verification."
- Bandwidth: "Business Registration Numbers (BRNs) are mandatory."
- Plivo: "Individual | for individuals operating without a formally registered business entity", but an EIN field matched to government documents.

Every form read still asks for a business use case, a public opt-in page, and privacy and terms pages. No provider page says a toll-free number may be verified for messaging a family member. NOT FOUND for any personal-use allowance on toll-free.

## 17. Unregistered sending and personal tiers (item 5)

CONFIRMED not possible at the 10DLC providers read: Telnyx ("any 10DLC traffic which is not registered will be blocked altogether"), Flowroute ("blocks all outbound messages from unregistered 10DLC numbers"), SignalWire ("Registration with TCR is required before you can use 10DLC numbers for messaging"), Voip.ms blog ("still requires registration"). Sinch's deck lists "Unregistered traffic" only as a surcharged class with no message class.
An officially supported personal or low-volume tier at any 10DLC or toll-free provider: NOT FOUND. The only low-volume routes with no customer registration are the ones that send on the provider's own numbers: Textbelt (1 free text a day, then prepaid), YouGot, Zapier, IFTTT.

## 18. First-hand 2026 reports (item 9)

All ANECDOTE. None is an individual reporting approval or refusal for personal use at one of the listed providers; I found no such report, and Reddit could not be read.

- 27 May 2026, Hacker News, "Show HN: I made an emergency page for my family": a commenter notes the project "needs multiple SaaS API keys (Openrouter, Resend, Textbelt)". A family-use project sending through Textbelt. https://news.ycombinator.com/item?id=48299570
- 7 July 2026, "SMS for Hobbyist Projects" (https://payne.org/projects/sms-for-hobbyists/, submitted at https://news.ycombinator.com/item?id=48817325): "I submitted a 10DLC application through my LLC, created fully functional mockups of registration pages and opt-in disclaimers. After nearly two months of back and forth, I gave up." The author then uses a cellular modem with a consumer SIM. The provider is not named.
- 3 April 2026, thread on "I Built an SMS Gateway with a $20 Android Phone": one commenter warns "You will be eviscerated by the carriers for doing this for anything longer than a single day." https://news.ycombinator.com/item?id=47625060 . Opinion, not a reported outcome.
- 27 to 28 March 2026, thread on a Telnyx package incident: "3 weeks after signing up they banned my account" (https://news.ycombinator.com/item?id=47547114); "I believe Telnyx and Twilio nuked every small or personal accounts at some point ... I am just calling some family once in a while" (https://news.ycombinator.com/item?id=47554675); and in reply "I've had a pretty good experience using it to send SMS" (https://news.ycombinator.com/item?id=47550364).
- 26 October 2026: someone registering for a company chatbot was "rejected like 3 times because I kept missing something". https://news.ycombinator.com/item?id=50250948

**What home-automation users use now.** CONFIRMED that the Home Assistant project itself warns its users off this path: https://www.home-assistant.io/integrations/twilio_sms/ "Twilio does not accept personal-use messaging programs, such as messages only to yourself, family, or friends, for A2P 10DLC registration or Toll-Free Verification." ANECDOTE (search snippets of community.home-assistant.io threads from 2023 to 2025, not 2026 and not read in full): users report moving to Telegram, the companion app's push notifications, an Android phone or GSM modem with its own SIM, and ntfy. I found no 2026 thread naming an SMS provider that works for them.

---

## Verdict for this part

Ranked by how likely this person is to end up with a working and permitted way to text one family member.

1. **Textbelt.** The only SMS API read whose own terms contemplate an individual sender and ask for no registration: "Indicate your name or business in your SMS" and a sender name is "the name of the business, organization, or person you're representing". Open to anyone with a card; about 1.4 to 6 cents a text, no monthly fee. Meets wants 1 to 4 in form: unattended sends, a status endpoint, a reply webhook for US numbers. Weak points, all from its own pages: status is polled and "not standardized between mobile carriers"; no published delivery figures; "not reliable enough" for life-safety use; shared-pool sender number; how the pool is registered is undisclosed. Worth a paid trial to the actual handset before relying on it.
2. **YouGot (Business tier API).** Documents this exact use: a reminder sent to someone else's phone, "intended for personal ... reminder use", under its own sender registration. Costs $79.99 a month for API access, needs a one-time code from the recipient, promises no delivery, and does not document passing delivery status or replies to the customer. A small operator.
3. **Vonage Sole Proprietor 10DLC.** The friendliest registration wording: examples are "Developer testing account, Single individual", and "for all companies other than individuals an EIN is required". No refusal of personal use found. But the campaign still passes the same registry and carrier review that produced Twilio's refusal, and the support pages with fees and steps would not load.
4. **Telnyx Sole Proprietor 10DLC.** Open to people with no EIN since February 2026, cheap ($4.50 + $15, then about $3 a month), with delivery and reply webhooks. Silent on personal use, but the guide requires "a single individual operating a business" and a URL that "demonstrates your business's legitimacy", and sign-up says a business email is mandatory. An honest application would have to say there is no business.
5. **Blooio "Personal use" plan.** Explicitly sold for personal use with an API, delivery reports and scheduling, at $39 a month. It sends iMessages, not SMS, from a shared number, and its own terms warn that Apple "may prohibit automated access". Fails the "ordinary texts" requirement.
6. **Sinch Sole Proprietor.** Exists in Sinch's own deck ($4, then $2 a month) but nothing current could be read; unknown stance.
7. **SMS by Zapier, IFTTT SMS.** Built for texting yourself; no registration. Zapier is "powered by Twilio" and bound by its messaging policy; IFTTT caps at 100 a month. Neither documents delivery status. Stopgaps only.
8. **Toll-free as a sole proprietor (Vonage, Telnyx, ClickSend, Plivo).** A registration number can be omitted, but every form demands a business use case, a public opt-in page and policies, with extra identity vetting and no guarantee. No page allows personal use.
9. **Not available to this person:** Flowroute (refuses personal messaging in writing), Bandwidth, Bird, SignalWire, Plivo 10DLC, Infobip, ClickSend 10DLC and TextMagic 10DLC (all need an EIN or have closed sole proprietor registration), Telgorithm (500,000-message minimum). **Voip.ms: unknown**, its rules could not be read.

No provider read today states in so many words that automated texts to a family member are a permitted registered use case. Textbelt and YouGot come closest because the customer registers nothing and their terms name a person or personal use.
