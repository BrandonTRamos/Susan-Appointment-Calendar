# Research part 1: the underlying rules, and Twilio in full

Researched 19 November 2026. Every item is marked CONFIRMED (read on the primary source today), ANECDOTE, or NOT FOUND (looked; the source does not say).

How pages were read:

- Twilio docs pages were fetched as their raw text versions (the same URL with `.md` added). The dates quoted are the `dateModified` value in each page's header.
- Twilio help-centre articles (`help.twilio.com/articles/<id>`) are drawn by script, so they were read through the content address the public page itself calls (`https://www.twilio.com/console/help-center/v1/knowledge-base/articles/<id>`). That address exposes no publication or edit date, so help-centre articles carry no date here unless the article text states one.
- PDFs (CTIA, T-Mobile, TCR, AT&T) were downloaded and converted to text.

A caution on Twilio's `dateModified`: many unrelated error pages share the identical stamp `2026-10-27T13:08:36.000Z`, and many A2P guide pages share `2026-10-30T12:13:45.000Z`. These are bulk republish stamps. They show a page was live after that date; they do not show that any given sentence was reviewed on that date.

---

## A. The industry rules

### A1. CTIA "Messaging Principles and Best Practices"

**Latest edition is May 2023.** CONFIRMED.

- URL: https://api.ctia.org/wp-content/uploads/2023/05/230523-CTIA-Messaging-Principles-and-Best-Practices-FINAL.pdf
- CTIA's own file listing (`https://api.ctia.org/wp-json/wp/v2/media?search=Messaging-Principles`) returns only two editions: one uploaded `2023-05-25` and one uploaded `2019-07-18`. No 2024, 2025 or 2026 edition is listed.

**The terms P2P and A2P were dropped; the test is who the sender is.** CONFIRMED.

> "Throughout these Principles and Best Practices, messages are categorized as either Consumer or Non-Consumer messaging depending on the Message Sender. The prior version of these Principles and Best Practices used the terms "Consumer (P2P)" and "Non-Consumer (A2P)." Some Wireless Providers may still use the legacy terms as part of their efforts to support a trusted messaging environment."

> "if the Message Sender is a business, organization, or other entity – or an agent, representative, or other individual acting on behalf of a business, organization, or other entity – the messaging is considered Non-Consumer."

**Definitions (section 3.3).** CONFIRMED.

> "3.3.1 Consumer. A Consumer is an individual person who subscribes to specific wireless messaging services or messaging applications. Consumers do not include agents, representatives, or any other individuals acting on behalf of Non-Consumers, including businesses, organizations, political campaigns, or entities that send messages to Consumers."

> "3.3.2 Non-Consumer. A Non-Consumer is a business, organization, or entity that uses messaging to communicate with Consumers. Examples include, but are not limited to, large-to-small businesses, financial institutions, schools, medical practices, customer service entities, non-profit organizations, and political campaigns."

**Consumer messaging (section 4.1).** CONFIRMED.

> "Consumer messaging is sent by a Consumer to one or more Consumers. Consumer messaging is uniquely originated from a single 10-digit NANP telephone number or chosen at the direction of the Consumer to a limited number of unique Consumer recipients. Consumer messaging is generally conversational, and an incoming message typically generates a response from the recipient. Consumer messaging does not involve substantially repetitive messages or exhibit characteristics of Unwanted Messaging traffic."

**Thresholds (Exhibit I, "Attributes of Typical Consumer Operation").** CONFIRMED. The document says these attributes "are illustrative of (but do not determine whether messaging constitutes) Consumer messaging."

| Attribute         | Value in Exhibit I                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Throughput        | "15 to 60 messages per minute"                                                                           |
| Volume            | "1,000 per day"                                                                                          |
| Unique Sender     | "1 telephone number assigned to or utilized by a single Consumer"                                        |
| Unique Recipients | "100 distinct recipients/telephone numbers per message"                                                  |
| Balance           | "1:1 ratio of outgoing to incoming messages per telephone number with some latitude in either direction" |
| Repetition        | "25 Repetitive Messages"                                                                                 |

**Automation (section 4.1.2).** CONFIRMED.

> "Some Consumers utilize automation to assist in responding to communications. For example, a Consumer may direct their messaging service to auto-reply to a phone call in order to inform the caller about the Consumer's status (e.g., "I'm busy" or "Driving now, can't talk"). Such use of automation to assist Consumers in their composition and sending of messages falls within the attributes of typical Consumer operation. In contrast, automation in whole or in part used by a Non-Consumer to facilitate messaging is not typical Consumer operation."

**Non-Consumer messaging (section 4.2).** CONFIRMED.

> "Non-Consumer messaging is sent by or to a Non-Consumer. ... For example, Non-Consumer messages may include messages sent to multiple Consumers from a business or its agents, messages exchanged with a customer service response center, service alerts or notifications (e.g., fraud, airline), and machine-to-machine communications."

**Is software-sent messaging from one individual to one family member Consumer or Non-Consumer under CTIA?**

- On CTIA's own words it is Consumer messaging. The test is the sender, and this sender is an individual who is not a business and acts for no business. 10 to 40 messages a month to one recipient is far inside every Exhibit I figure. Section 4.1.2 accepts a Consumer using automation. (Reading of CONFIRMED text; the conclusion is mine.)
- NOT FOUND: CTIA does not address an individual sending scheduled messages through a cloud messaging provider's API. Its automation example is an auto-reply from the Consumer's own messaging service.
- CTIA does not bind the carriers to its classification. CONFIRMED (section 2.3): "As a set of voluntary best practices, CTIA's Principles and Best Practices do not impose, prescribe, or require contractual or technical implementation on messaging ecosystem stakeholders, including Service Providers. ... Stakeholders may choose to implement modified and additional requirements through their individual guidelines, policies, and contracts." In practice AT&T classifies by automation and Twilio by the route the message arrives on, not by CTIA's sender test. See A3 and B5.

### A2. The Campaign Registry (TCR)

**Sole Proprietor is "a small business or individual" without an EIN.** CONFIRMED.

- URL: https://www.campaignregistry.com/wp-content/uploads/CSP-User-Guide_Jul_2026_v2.pdf (TCR CSP User Guide, July 2026; linked from https://www.campaignregistry.com/resources/)

> "SOLE_PROPRIETOR. A SOLE_PROPRIETOR is a small business or individual in the US and Canada that DOES NOT have an EIN (see more information in section 14). When registering these entities, a DBA or Brand name, country of registration, full address, reference ID (a unique identifier of the client in the CSP database), first name, last name, email, and telephone number are required. While optional, it is strongly recommended to fill out the website/online presence field. We only accept sole proprietor registrations from the US or Canada."

> "Both the SOLE_PROPRIETOR entity type and use case are limited to small businesses and individuals in the US and Canada that DO NOT have an EIN. The ability to register SOLE_PROPRIETOR brands and campaigns requires an additional contract to be signed"

> "One campaign allowed per brand, with a maximum of 1 associated TN ... 1000 msg/day limit (T-Mobile) and 15msg/minute limit (AT&T) per campaign - CSP to enforce daily limits"

**TCR's FAQ.** CONFIRMED.

- URL: https://www.campaignregistry.com/resources/

> "*Within TCR, a Sole Proprietor is an individual that does not have an EIN. Therefore, an EIN cannot be entered."

**TCR's Sole Proprietor Policy.** CONFIRMED.

- URL: https://www.campaignregistry.com/Sole-Proprietor-Policy.pdf ("Updated on 9/29/2023")

> "The Sole Proprietor (SP) use case is designed to allow sole proprietors without an EIN to be able to register and send A2P 10DLC messaging. It is not intended as a low volume use case alternative to the existing verified sending categories for normal businesses that have EINs."

> "It is the responsibility of the CSP to ensure that only Sole Proprietor brands are registered using this use case."

- The policy's field list is written in business terms ("Display Name: This should be the Brand Name of the SP business", "First Name: The first name of the owner of the SP Business").
- Limits: "OTP confirmed mobile number can be associated with a maximum of 3 SP brands - across all CSPs".

**TCR on who must register.** CONFIRMED.

- URL: https://www.campaignregistry.com/wp-content/uploads/TCR-Intro-2026-v4_comp.pdf

> "Any business that wants to use a SMS on 10DLC to communicate with their customers and/or employees is required to register. ... All business messaging is considered non-consumer (A2P) messaging."

**Personal or non-business use.** NOT FOUND. None of the four TCR sources (resources page, CSP User Guide July 2026, Sole Proprietor Policy, 2026 introduction) contains the words "personal use", "hobbyist" or "non-business", and none says a Sole Proprietor campaign must serve a business purpose. TCR's guide refers to a fuller "Policy document" in its "Portal Knowledge Base", which sits behind a CSP login and could not be read.

### A3. Carrier codes of conduct

**T-Mobile Code of Conduct.** CONFIRMED (version 2.2, November 2020, on T-Mobile's own site).

- URL: https://www.t-mobile.com/support/public-files/attachments/T-Mobile%20Code%20of%20Conduct.pdf

> "Version 2.2 November 2020"

> "T-Mobile supports commercial messaging traffic today on three dedicated paths: Shortcodes, Toll-Free, and Longcode. All commercial messaging traffic commonly referred to as non-consumer traffic must be protected from SPAM and malicious malware."

> "Long Code (10DLC): A 10-digit phone number used for non-consumer messaging."

> "All users of the T-Mobile network including users of the software, API, or gateway services are held to the same standards and expectations."

- NOT FOUND: the document does not contain "sole proprietor", "hobbyist" or "personal use", and does not define Consumer or P2P messaging. It predates the Sole Proprietor category. No later version was found on T-Mobile's site or by search.

**AT&T Code of Conduct.** CONFIRMED on a third-party-hosted copy only; a copy on AT&T's own domain was NOT FOUND.

- URL (hosted by a provider, not AT&T): https://www.apeiron.io/static/files/terms/ATT-A2P-Code-of-Conduct-10-01-2020.pdf ("Code of Conduct for the AT&T Short Code and 10-Digit A2P SMS Messages 10/01/2020")

> "A2P Message – Any SMS message to or from a mobile subscriber account for which the content is generated in whole or in part by an automated process or for which a single manual send command results in multiple messages being sent. A group message where all recipients of a small social group receive the same message and the content is personal and non-commercial is excluded from the definition of an A2P Message."

> "P2P and Unregistered A2P Rate Limiting: Unless explicitly authorized in writing by AT&T, neither P2P nor unregistered A2P Messages shall exceed AT&T's maximum P2P message sending rate, which is currently 15 SMS messages or segments thereof, per sending number per minute. [Note: AT&T may in the future require all A2P messaging to be authorized.]"

- AT&T's test differs from CTIA's. AT&T classifies by automation, so a scheduled reminder generated by software is an A2P Message whoever the sender is. The one exclusion (a personal, non-commercial group message to a small social group) does not fit a one-to-one automated reminder.
- For informational messages AT&T's consent table says: "Consumers may give permission over text, on a form, on a website, or verbally."
- NOT FOUND: "sole proprietor", "hobbyist".

### A4. Is "personal use not eligible" a carrier or TCR rule, or Twilio's own policy?

**Toll-free: it is industry-wide, not Twilio's alone.** CONFIRMED on two other providers' pages. The same rejection code with the same title took effect on the same day as Twilio's.

- Sinch, https://support.sinch.com/hc/en-us/articles/56105005191699-New-Toll-Free-Verification-Rejection-Codes (article `updated_at` 2026-10-05):

> "UPDATE: Starting on September 15, 2026, new rejections codes have been added, increasing from 83 codes to 118 codes."

> "1114 | Business Information Issues | Personal use cases are not allowed | Personal use cases, such as sending messages exclusively to the owner of the line, family members, or for general personal use, are not allowed. A business use case is strictly required to register a Toll-Free number for A2P compliance. | Not Eligible for Resubmission"

> "1115 | ... | Toll-Free numbers only support A2P (Application to-Person) use cases. P2P (Person-to-Person) use cases are not supported via Toll-Free messaging. | Not Eligible for Resubmission"

- Bandwidth, https://www.bandwidth.com/support/en/articles/12823242-toll-free-verification-rejection-reasons (dated September 22, 2026):

> "New and updated codes are effective as of September 15, 2026."

> "1114 | Business Information Issues | Personal use cases are not allowed | Eligible for Resubmission | Toll-Free numbers require a business use case. Resubmit with a valid one to move forward."

- The two providers disagree on whether code 1114 can be resubmitted (Sinch: not eligible; Bandwidth: eligible). Both shown.
- Twilio's 30532, 30533, 30534 and 30535 match Sinch and Bandwidth 1114, 1115, 1116 and 1117 one for one, with the same start date. The shared numbering across unrelated providers points to one upstream toll-free code list. That last sentence is my inference; no page names the upstream owner.

**10DLC: the only source found that excludes personal use is Twilio.**

- CONFIRMED: Twilio applies the toll-free code to 10DLC itself. https://help.twilio.com/articles/9321443984155: "New codes are shared with A2P 10DLC where the rejection meaning matches."
- CONFIRMED: TCR admits "individuals" as Sole Proprietors (A2).
- NOT FOUND: no TCR, CTIA, T-Mobile or AT&T text says a 10DLC Sole Proprietor campaign must be for business use or excludes messages to oneself or family.
- So for 10DLC the exclusion is documented as Twilio's vetting policy. Whether other providers' 10DLC vetting does the same is not answered by any rule-owner's page; it has to be checked per provider.

---

## B. Twilio

### B5. Error 30532 and the Sole Proprietor pages

**Error 30532, exact text.** CONFIRMED.

- URL: https://www.twilio.com/docs/api/errors/30532 (`dateModified: 2026-10-27T13:08:36.000Z`)

> "30532: Personal use cases are not supported"
>
> "This error applies to both Toll-Free Verification and A2P 10DLC registration."
>
> "Your registration must describe a business use case. Messaging programs used only for personal purposes, such as reaching yourself, family members, or friends, are not eligible."
>
> Possible causes: "The number was requested to send reminders to yourself, friends, or family members." / "The use case describes general personal messaging rather than a business activity."
>
> Possible solutions: "If the submitted description does not reflect your actual business messaging, correct it and provide matching evidence. Personal messaging itself is not supported by this registration program; changing only the description does not make it eligible."

**When it started: 15 September 2026.** CONFIRMED.

- Changelog, https://www.twilio.com/en-us/changelog/new-error-codes-provide-clearer-tfv-and-a2p-10dlc-registration-f ("Messaging | Aug. 06, 2026"):

> "On September 15, 2026, Twilio will add new error codes for Toll-Free Verification and A2P 10DLC campaign registration rejections."

- Help article "A2P 10DLC Campaign Registration Rejected", https://help.twilio.com/articles/15778026827291, under the heading "New shared error codes from September 15, 2026":

> "30532 | Personal use cases are not supported | Personal messaging is unsupported. If the description is inaccurate, correct it to reflect your actual business messaging and provide matching evidence; do not simply relabel personal traffic."

and in its general advice: "Correct the actual use case and evidence. Renaming personal or person-to-person traffic does not make it eligible for this registration program."

- The same row appears in "Why Was My Toll-Free Verification Rejected?", https://help.twilio.com/articles/9321443984155.
- NOT FOUND: the first publication date of the 30532 page itself. The Internet Archive holds no capture of it.

**Related codes.** CONFIRMED.

- 30533, https://www.twilio.com/docs/api/errors/30533: "Messaging registration supports application-to-person (A2P) use cases only. Person-to-person (P2P) messaging is not supported." Cause: "The use case describes individuals texting each other rather than a business sending messages to consumers."
- 30534, https://www.twilio.com/docs/api/errors/30534: "Testing use cases still require complete, accurate business information and full messaging program details." Solution: "Provide accurate business details, including a live website, valid address, and correct contact information." and "Confirm that messaging is strictly internal and that no messages will be sent to external recipients".
- 30912 (an older 10DLC-only code), https://www.twilio.com/docs/api/errors/30912: "Your A2P 10DLC campaign was rejected because the campaign details describe personal or peer-to-peer messaging instead of business messaging sent from an application to a person." and "If your traffic is truly personal or peer-to-peer, do not submit it as an A2P 10DLC campaign. Use A2P 10DLC only for business messaging sent from an application to end users."
- 30915, changelog "Programmable Messaging | Jul. 17, 2026", https://www.twilio.com/en-us/changelog/error-code-30915-now-flags-invalid-sole-proprietor-classificatio: Sole Proprietor filings that are really an LLC or corporation are rejected, on both 10DLC and toll-free.
- A further batch of 10DLC rejection codes is announced for 9 December 2026 (changelog "Nov. 13, 2026", https://www.twilio.com/en-us/changelog/new-a2p-10dlc-campaign-rejection-error-codes). It adds nothing on personal use. It includes "30979 Verbal or phone opt-in script missing or incomplete".

**What the Sole Proprietor pages say now.** All CONFIRMED, all live today.

- A2P 10DLC overview, https://www.twilio.com/docs/messaging/compliance/a2p-10dlc (`dateModified: 2026-10-30`):

> "Carriers consider all SMS traffic from Twilio to be sent from an application. Anyone using a 10DLC number with Twilio to send SMS messages to the US will need to register. This includes individuals and hobbyists using Twilio."

> Sole Proprietor row: "You're a student, hobbyist, someone working at an organization or someone trying out Twilio messaging products for the first time."

> "No Tax ID (hobbyist, individual, US/Canada only)? See Direct Sole Proprietor Registration."

- Direct Sole Proprietor Registration Overview, https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview (`dateModified: 2026-10-30`):

> "A Sole Proprietor is either a hobbyist or an individual businessperson who uses their own Social Security number (or Canadian Social Insurance Number) when filing income taxes."

> "your business address (this can also be your personal address if you are registering for yourself and not as a business)"

> "Your Brand name: Either your business name, or your first and last name if you register as an individual"

- The new-Console version of that guide repeats it: "A Sole Proprietor is a hobbyist or an individual businessperson who files income taxes with their own Social Security Number".
- Quickstart, https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/quickstart (`dateModified: 2026-10-27T20:46:31`):

> "Sole Proprietor: you aren't acting as part of a registered business (includes hobbyists) and you're located in the US or Canada."

Its campaign table has a column headed "Example value: hobbyist test application to try Twilio", with "This campaign sends messages related to system activity for my development environment testing suite." and "I am the only recipient of messages for my development testing suite."

- Gather the Required Business Information, https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/collect-business-info: "If the customer is not a business entity but instead is a hobbyist, college student, etc., use their first name and last name."
- Help article "Toll-Free Verification and Developers: Navigating the New Restrictions", https://help.twilio.com/articles/20212966914075 (undated; its text refers to 8 November 2023 and 31 January 2024):

> "the lowest tier, Sole Proprietor, is intended both for individuals running sole-proprietor businesses ... and can also work for "hobbyists" if they meet these registration requirements."

> "In your campaign description, you can provide a short (2-3 sentence) description of the application you intend to build. For example: "I send text messages to myself for {a description of your use case}. The messages will be related to {description of message content}.""

> "Toll-free numbers are designated for medium/large business messaging and are not meant to be used for hobbyist developers."

- Launch post, https://www.twilio.com/en-us/blog/products/launches/sole-proprietor-api-and-console-experience-for-10dlc-registration (April 13, 2023): "Meant for hobbyists and US or Canadian businesses without an Employer Identification Number" and "Hobbyist Developers – i.e. student developers, or developers using Twilio to build personal projects".
- Trust Hub profiles, https://www.twilio.com/docs/trust-hub/profiles (`dateModified: 2026-09-25`): "Create an individual profile if you're a sole proprietor or individual user exploring and building with Twilio products. With an individual profile, you can access: Limited A2P 10DLC messaging, International messaging, Unbranded voice calls".
- Messaging Policy, https://www.twilio.com/en-us/legal/messaging-policy ("Last Updated: April 13, 2026"):

> "Twilio treats any and all messages transmitted via the Twilio Messaging Services as non-consumer or application-to-person (A2P) messages, regardless of the actual content of the message or the type of message recipient. You are prohibited from transmitting person-to-person (P2P) messages via the Twilio Messaging Services."

It lists "appointment reminders" as an A2P example. It does not use the words "personal use".

**How they conflict, stated plainly.**

- The guides say who may register: an individual or hobbyist with no EIN. One older help article even offers "I send text messages to myself for ..." as a model campaign description.
- Error 30532 says what the messages may be for: a business use. It names "reminders to yourself, friends, or family members" as a cause of rejection, and says rewording does not cure it.
- Both sets of pages are live. The guide wording dates from the April 2023 launch and has been carried forward. The 30532 rule is the newer one: announced 6 August 2026, in force from 15 September 2026.
- The two can be read together without contradiction on one point only. Twilio's remaining hobbyist example is a developer's "testing suite" with the developer as sole recipient, which the new codes treat as a testing use case (30534), not as personal use. This project's use case is not testing. It is reminders to a family member, which is the exact example 30532 gives.
- NOT FOUND: any Twilio page that says the hobbyist wording has been withdrawn, or that says a Sole Proprietor campaign for family reminders is acceptable.

### B6. Twilio toll-free verification

**What it requires today.** CONFIRMED.

- "Toll-Free Verification Onboarding Guide", https://help.twilio.com/articles/13264118705051:

> "Business Registration Number: Valid 9-digit IRS EIN (U.S.) or international equivalent."

> "providing a government business registration number is mandatory, and your Legal Entity Name must exactly match official tax records. U.S. entities must provide a 9-digit IRS EIN matching their official registration"

> "Live Business Website: Fully accessible website containing active, live links to both the ToS and Privacy Policy."

> "Legitimacy: Evidence of an active, verifiable commercial entity."

- A paid account is required: https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding (`dateModified: 2026-09-25`): "To complete toll-free verification, you need a paid Twilio Account (not in trial)."

**Business type options, and the Sole Proprietor exception.** CONFIRMED.

- API reference, https://www.twilio.com/docs/messaging/api/tollfree-verification-resource: `BusinessType` is one of "PRIVATE_PROFIT, PUBLIC_PROFIT, NON_PROFIT, SOLE_PROPRIETOR, GOVERNMENT. Required field." and `BusinessRegistrationNumber` is "Required for all business types except SOLE_PROPRIETOR."
- "Toll-Free Verification Policy for Collecting Business Registration Number", https://help.twilio.com/articles/38266268244507:

> "If no EIN is available (e.g., a self-run business or sole prop with no employees), you may indicate this through setting the businessType to SOLE_PROPRIETOR."

> "Personal IDs: Do not use personal SSNs or identifiers where a business registration is required."

- So a sole proprietor business with no EIN is accepted. The onboarding guide's "mandatory" EIN sentence and the API's Sole Proprietor exception conflict on their face; both shown. The API reference and the policy article are the more specific.

**2025 and 2026 changes.** CONFIRMED.

- "Starting on September 30th 2025, customers can begin including their Business Registration Number (BRN) as part of the submission process. Beginning February 17th 2026, BRNs will be mandatory for all new TFV submissions." (article 38266268244507)
- "Starting September 15, 2026, toll-free verification submissions must include separate URL fields for your Privacy Policy and Terms and Conditions. Submissions missing these links will be rejected with error 30493." (article 13264118705051)
- 15 September 2026: the new rejection codes, including 30532.

**Personal use is excluded here too.** CONFIRMED.

- 30532: "This error applies to both Toll-Free Verification and A2P 10DLC registration."
- In the new Console, toll-free messaging is a business-profile feature. https://www.twilio.com/docs/trust-hub/profiles lists "US toll-free messaging" under Business profiles only, and the toll-free guide says "You must select that you're a Business / Nonprofit / Sole Proprietor to see toll-free numbers."
- The `OptInType` list does include `VERBAL`, and the guide accepts a "sample verbal consent collection and script in a document". Verbal consent is an accepted method; it does not help with the business-use requirement.

### B7. Other Twilio senders

**Short codes.** Not open. CONFIRMED.

- https://www.twilio.com/en-us/sms/pricing/us: "Random short code ... $1000 **Billed quarterly, requires one time setup fee".
- https://help.twilio.com/articles/360038173654: short code "Registration Restrictions: Company address and website required."
- https://www.twilio.com/docs/trust-hub/profiles lists "Short codes" under Business profiles only.

**Alphanumeric sender ID.** Not available to US numbers. CONFIRMED.

- https://help.twilio.com/articles/223133767: "United States | No", where No means "Registration is not required and network capability is not supported by mobile operators".

**RCS.** Not open. CONFIRMED.

- https://www.twilio.com/docs/rcs/onboarding (`dateModified: 2026-10-08`): a US sender needs "US Business Registration ID. US companies provide your Employer Identification Number (EIN)." and "Legal business name: The Legal Company Name as stated on your IRS CP 575 EIN Confirmation Letter".
- It would also not arrive as an ordinary text.

**WhatsApp through Twilio.** Not an ordinary text, and built for businesses. CONFIRMED.

- https://www.twilio.com/docs/whatsapp/self-sign-up (`dateModified: 2026-11-05`): requires "administrator access to your Meta Business Portfolio" and "you'll need to complete Meta business verification before you can move into production."
- The recipient would need WhatsApp installed. Fails requirement 1 as stated.

**Twilio Verify.** No custom reminder content. CONFIRMED.

- https://www.twilio.com/docs/verify/api/templates (`dateModified: 2026-09-28`): "Templates are predefined and approved messages used to send Verifications".
- https://www.twilio.com/docs/verify/verification-templates: "Custom templates have a unique message body that is provided by the template requester and are available on a case-by-case basis." Every template shown carries a `{{code}}` one-time passcode.
- The 10DLC docs offer Verify only for "user verification text messages".
- NOT FOUND: a sentence that says in terms "Verify may not be used for reminders". The product has no way to send free text, which settles it.

**Twilio Programmable Voice (a spoken reminder call).** Open to a US individual. CONFIRMED.

- Identity requirement, https://help.twilio.com/articles/42720101060379:

> "Effective August 3, 2026, All Twilio accounts will need a Primary Compliance Profile to make outbound calls to +1 numbers."

> "For Customers in the US and Canada: ... Create and submit your Business or Individual Primary Compliance Profile for approval. Allow up to 7 business days for review and verification."

- What an Individual profile needs, https://www.twilio.com/docs/trust-hub/profiles: name, email, phone, address, "Government-issued photo ID" and "Photo-selfie submission". It grants "Unbranded voice calls". "After you complete the steps, you'll receive approval within two days." (The two pages give different review times; both shown.)
- Without an approved profile calls are blocked. https://www.twilio.com/docs/api/errors/21216: "Your account is placing a call to a +1 destination without an approved Primary Customer Profile."
- STIR/SHAKEN, https://www.twilio.com/docs/voice/trusted-calling-with-shakenstir/shakenstir-onboarding (`dateModified: 2026-08-19`): level A needs an "Approved Business Profile" and an "Approved SHAKEN/STIR Trust Product". A call is "signed with C level attestation" when there is "No approved Business Profile(s) and SHAKEN/STIR Trust Product(s)". So an individual's calls go out at the lowest attestation level.
- The tools that reduce spam labelling are business-only. https://www.twilio.com/docs/voice/spam-monitoring-with-voiceintegrity: "Have an Approved Primary or Secondary Business Profile." Branded calling is listed under Business profiles only.
- Cost, https://www.twilio.com/en-us/voice/pricing/us: local number "$1.15 / mo"; outbound local calls "$0.0140 / min".
- Trial accounts can call only verified numbers and "expire 30 days after sign-up" (https://www.twilio.com/docs/usage/trials), so a paid account is needed.
- NOT FOUND: any Twilio page that excludes personal use from Voice. No registration of the call's purpose is asked for.
- Not verified here: the federal rule on prerecorded or artificial-voice calls to mobile phones (47 CFR 64.1200). The eCFR address returned HTTP 406 and the text could not be read. Check it before relying on Voice.
- Risks that follow from the above (my reading): a C-attested call from an unknown local number may be labelled or silenced by the carrier or the iPhone; a call reports answered or not, not "read"; replies are not texts.

### B8. Unregistered 10DLC traffic on Twilio

**It is blocked outright, with error 30034.** CONFIRMED.

- https://www.twilio.com/docs/api/errors/30034 (`dateModified: 2026-04-21`):

> "Twilio blocks messages to U.S. numbers when you send from a +1 10DLC number that is not associated with an approved A2P 10DLC Campaign."

- Changelog "Sep. 01, 2023", https://www.twilio.com/en-us/changelog/-u-s--a2p-10dlc--full-blocking-of-traffic-sent-from-unregistered:

> "Messages sent to the U.S. using unregistered +1 10DLC numbers will be blocked. Blocked messages will return error code 30034 ... Twilio messaging rates will still apply, even for blocked messages."

**Unverified toll-free is blocked too, with error 30032.** CONFIRMED.

- https://help.twilio.com/articles/5377174717595: "As of January 31, 2024, messages sent from any unverified (Restricted or Pending) Toll-Free phone numbers (TFPN) are blocked."

**Is there a supported way to send a small volume unregistered?** No. CONFIRMED.

- Error 30034's only alternatives are other registered senders: "use a sender type that is not part of A2P 10DLC, such as a Toll-Free number, short code, or Twilio Verify for verification use cases."
- Trial account, https://www.twilio.com/docs/usage/trials (`dateModified: 2026-11-13`): "You can send messages and make calls only to verified phone numbers." "Each account can verify up to 5 recipients." "Trial accounts expire 30 days after sign-up." "Trial numbers are shared Twilio-owned numbers, not dedicated numbers assigned to your account." A trial is therefore not a lasting route, and a shared number cannot carry the recipient's replies back reliably.
- Virtual Phone: a simulated handset, not a real phone. "Because this number is not associated with a carrier, Messaging API calls to this number will not traverse the carrier network" (article 20212966914075).

**Costs, had 10DLC Sole Proprietor been open.** CONFIRMED, for reference.

- https://help.twilio.com/articles/1260803965530: "US A2P Sole Proprietor Brand registration fee: $4.50 one-time", "$15 vetting fee", Sole Prop campaign "$2/month". Number "$1.15" a month and "$0.0083" a segment plus carrier fees (https://www.twilio.com/en-us/sms/pricing/us).
- The $15 vetting fee is charged at the first vetting decision, including a rejection: "The vetting fee is only charged once per Campaign, at its first vetting decision" (https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/troubleshooting-a2p-brands/troubleshooting-and-rectifying-a2p-campaigns-1).

### B9. First-hand reports from 2026

NOT FOUND. No 2026 first-hand report was found of an individual's Sole Proprietor campaign for personal or family reminders being approved, or being rejected with 30532.

What was searched: web search for Reddit, Hacker News, Stack Overflow and Twilio community threads (four differently worded queries), and the Hacker News comment search for all 2026 comments on "10DLC", "twilio SMS", "A2P registration", "toll-free verification", "twilio sole proprietor personal" and "twilio 30532". Reddit's own search could not be queried directly, so Reddit coverage rests on the web search alone.

The nearest items, both ANECDOTE and neither on point:

- Hacker News, 7 July 2026, https://news.ycombinator.com/item?id=48817326. The submitter of a write-up titled "SMS for Hobbyist Projects" writes: "It's difficult for hobbyists to get 10DLC approval for SMS (text messaging) for small projects. Here's a way to do it using a cell phone module and a cheap, unlimited-text-messaging plan." No provider, error code or outcome is given. It points at a route outside this part (a cellular modem on a consumer plan).
- Hacker News, 26 October 2026, https://news.ycombinator.com/item?id=50250948. A commenter registering a company chatbot reports "being rejected like 3 times because I kept missing something". A business use, no provider named.

---

## Verdict for this part

| Route                                             | Open to this person?                                                                                                                             | Strongest single piece of evidence                                                                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Twilio A2P 10DLC, Sole Proprietor                 | **No**, as documented. The person can register; the use case is the named ground for rejection.                                                  | Error 30532, in force from 15 September 2026: cause "The number was requested to send reminders to yourself, friends, or family members"; "changing only the description does not make it eligible." https://www.twilio.com/docs/api/errors/30532 |
| Twilio toll-free verification                     | **No**                                                                                                                                           | The same 30532 "applies to both Toll-Free Verification and A2P 10DLC registration", and Sinch and Bandwidth carry the identical toll-free code 1114, so this one is industry-wide.                                                                |
| Twilio unregistered 10DLC or unverified toll-free | **No**                                                                                                                                           | "Twilio blocks messages to U.S. numbers when you send from a +1 10DLC number that is not associated with an approved A2P 10DLC Campaign." (error 30034)                                                                                           |
| Twilio trial account                              | **No** (not lasting)                                                                                                                             | "Trial accounts expire 30 days after sign-up"; shared Twilio-owned numbers.                                                                                                                                                                       |
| Twilio short code                                 | **No**                                                                                                                                           | Business profile only; "$1000" a month; "Company address and website required."                                                                                                                                                                   |
| Twilio alphanumeric sender                        | **No**                                                                                                                                           | "United States                                                                                                                                                                                                                                    | No". |
| Twilio RCS                                        | **No**                                                                                                                                           | US sender needs an EIN.                                                                                                                                                                                                                           |
| WhatsApp through Twilio                           | **No**                                                                                                                                           | Needs Meta business verification, and is not an ordinary text.                                                                                                                                                                                    |
| Twilio Verify                                     | **No**                                                                                                                                           | Fixed one-time-passcode templates only; no free text.                                                                                                                                                                                             |
| Twilio Programmable Voice (spoken reminder call)  | **Yes**, with an approved Individual compliance profile (photo ID and selfie). It is a call, not a text, signed at the lowest attestation level. | "For Customers in the US and Canada: Create and submit your Business or Individual Primary Compliance Profile for approval." https://help.twilio.com/articles/42720101060379                                                                      |

On the underlying rules:

- **CTIA** would class this traffic as Consumer messaging, because the sender is an individual acting for no business. CTIA is voluntary and does not decide how a provider's route is treated.
- **TCR** admits "individuals" without an EIN as Sole Proprietors and says nothing on personal use. No TCR or carrier text was found that bars a personal-use 10DLC campaign.
- **For 10DLC the personal-use bar is, on the evidence, Twilio's own vetting policy.** A Sole Proprietor campaign at another provider is therefore undocumented either way at the rule-owner level, and has to be settled from each provider's own pages.
- **For toll-free the bar is industry-wide** from 15 September 2026. Toll-free is closed to this use at any provider that uses the shared code list.
- **AT&T** treats any automated message as A2P and caps unregistered traffic at "15 SMS messages ... per sending number per minute"; that 2020 text also notes AT&T "may in the future require all A2P messaging to be authorized."
