# Research part 2: AWS and the other big clouds

Researched 19 November 2026. Every "CONFIRMED" item was read today on the page named. Quotes are exact text from the page (AWS doc pages were pulled as their `.md` source, so the quotes are character-exact).

Labels: **CONFIRMED** = read on the primary source today. **ANECDOTE** = a first-hand report, not policy. **NOT FOUND** = I looked on the named source and it does not say.

How pages were read, and what would not load:

- AWS documentation: fetched directly as `https://docs.aws.amazon.com/sms-voice/latest/userguide/<page>.md` (the markdown source of each HTML page). All loaded.
- AWS pricing page and the AWS toll-free blog post: loaded with a direct HTTP request; text extracted from the HTML.
- re:Post: the fetch tool got HTTP 403 on every re:Post URL. A direct HTTP request with a browser user agent worked, and I read the question and answer text from each page's embedded structured data.
- Reddit and Hacker News: three web searches (generic terms) returned no thread about an individual registering an AWS toll-free number. Nothing to report from either site.
- The live AWS console form (the real drop-downs) could not be inspected; that needs a signed-in AWS account. Everything about form fields below is from the documentation's field reference.

---

## 1. AWS End User Messaging SMS: toll-free number registration

### 1.1 What the form requires

Source: https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-tfn-register.html

CONFIRMED. Company section: "For **Company Name**, enter the name of your company." / "For **Company website**, enter the URL for your company's website." / "For **Address 1**, enter the street address of your corporate headquarters." plus city, state, zip, country, and business type.

CONFIRMED. Contact section: first name, last name, "**Support Email**", "**Support Phone Number**".

CONFIRMED. Messaging use case section: monthly volume, a use case category (the list includes "**Appointment reminders** – Use this for sending appointment reminders."), use case details, Privacy Policy URL, Terms and Conditions URL, opt-in category, opt-in workflow description, an opt-in workflow image (PNG, max 400KB), and one to three message samples.

CONFIRMED. The opt-in category list includes "**Verbal**". For informational messages the image must be: "**Informational**: Provide a mockup or screenshot of a verbal consent workflow and provide the messaging content."

CONFIRMED. Privacy policy and terms are now mandatory: "The **Privacy Policy URL** and **Terms and Conditions URL** fields are required for all new toll-free number registrations submitted on or after September 15, 2026." The policy "must be relevant to your business and consistent with the opt-in disclosures presented to message recipients."

CONFIRMED (AWS blog, dated 19 NOV 2025, https://aws.amazon.com/blogs/messaging-and-targeting/how-to-register-for-a-us-toll-free-number-with-aws-end-user-messaging/). The contact email "should match the domain of the company being registered and cannot be a distribution list, contact group, or mailing list."

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/registration-help.html). "Before submitting a registration, ensure you have: ... A privacy policy and terms of service published on your website. ... A valid business website that matches your brand identity."

### 1.2 Is there a "Sole proprietor" option? Yes.

CONFIRMED (registrations-tfn-register.html). "For **Business type**, choose the classification of your organization by ownership and purpose. Options include: **Private profit** – Privately held for-profit company / **Public profit** – Publicly traded for-profit company / **Non-profit** – Non-profit organization / **Sole proprietor** – Sole proprietorship without employees / **Government** – Government entity".

There is no "Individual" or "Personal" option in that list. NOT FOUND: the words "individual" (as a registrant type), "personal use" or "hobby" do not appear on the toll-free form page, the toll-free process page, the toll-free FAQ, or the toll-free rejection reasons page.

### 1.3 Tax ID / business registration number, and whether the 2025/2026 mandate has reached AWS

CONFIRMED. The mandate has reached AWS, with an exemption for Sole proprietor: "Unless you select **Sole proprietor**, the following three company identification fields are required: **Company identification number**, **Identification number type**, and **Identification number country**."

CONFIRMED. What the number is: "enter your company's official tax identification or registration number (such as EIN or VAT) used to verify your business identity with telecommunications carriers. For example, `12-3456789`." Type options: "EIN, CBN, CRN, PROVINCIAL\_NUMBER, VAT, ACN, ABN, BRN, SIREN, SIRET, NZBN, USt-IdNr, CIF, NIF, CNPJ, UID, NEQ, and OTHER."

So, read literally, an applicant who picks Sole proprietor may leave the three identification fields empty. The documentation gives no date on which the fields became required (NOT FOUND in the page or in the guide's document history, https://docs.aws.amazon.com/sms-voice/latest/userguide/doc-history.html).

NOT FOUND: what an individual should enter. No AWS page I read mentions SSN or Social Security number for toll-free registration.

Open question the documentation does not answer. The verification page (https://docs.aws.amazon.com/sms-voice/latest/userguide/registration-help-tfn-verification.html) describes verification only for registrants who supply a number:

- CONFIRMED. "When you submit a toll-free number registration, your business identity is verified using the company identification number (such as an EIN) that you provide."
- CONFIRMED. "Business verification is an industry-wide requirement for toll-free messaging. Carriers use your business registration number to confirm your identity against official business registries."
- CONFIRMED. "If either check fails, your registration is denied with a business verification failure reason."
- CONFIRMED. The accepted supporting documents are all business documents: "IRS CP 575", "IRS 147C", "State incorporation certificate", "Official business registry extract". "A W-9 form is **not accepted**".
- NOT FOUND. How a Sole proprietor registration with no number is verified. The page does not mention sole proprietors at all.

These two pages do not contradict each other in words, but they leave a gap: the form page exempts sole proprietors from the number, and the verification page says identity "is verified using" the number. See the anecdote in section 7.1, where a self-described sole proprietor reports "Company Verification Failed" until an EIN was added.

### 1.4 Does AWS say anything about personal, hobbyist or non-business use?

For toll-free specifically: NOT FOUND. No AWS toll-free page states that personal or family messaging is ineligible, and none states that it is eligible. The forbidden use case section (https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-tfn.html) lists content categories only: "Certain use cases are blocked entirely (for example, use cases related to controlled substance, or phishing)".

For US registrations in general, AWS does have a "personal" rejection reason, worded for 10DLC:

- CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/registration-help-rejection-troubleshooting.html). The page says its reasons "apply to all US registration types including 10DLC campaigns, Toll-Free numbers, and Short Codes."
- CONFIRMED (same page). "Personal or P2P use case detected | CAMPAIGN\_NOT\_QUALIFIED\_P2P | The campaign describes personal or peer-to-peer messaging, which is not permitted for A2P 10DLC. | Describe a clear business use case and the application or system that generates the messages."
- CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/registration-help-review-criteria.html). "Reviewers confirm that the registering entity is a real, legitimate business." Listed mistake: "Describes personal or P2P messaging | Personal or P2P use case detected". Also: "Support email uses a branded domain (not Gmail, Yahoo, Outlook, or other public providers)".

The sentence that bans personal messaging names "A2P 10DLC", not toll-free. Whether the same reason is applied to a toll-free registration is undocumented.

CONFIRMED (AWS Service Terms, "Last Updated: November 19, 2026", https://aws.amazon.com/service-terms/, section 29 "Amazon Pinpoint and AWS End User Messaging"). I searched the whole page for "personal use", "household" and "non-commercial"; none of the hits is in the End User Messaging or SNS sections. NOT FOUND: any term there that limits End User Messaging to business customers.

### 1.5 Review time and what a rejection looks like

CONFIRMED (registrations-tfn.html). "It can take up to 15 business days for your registration to be processed after it is submitted."

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-tfn-register-faq.html). "If your registration is rejected, its status will be changed to **Requires Updates** and you can make updates".

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-status.html). "**REQUIRES\_UPDATES** – You must fix your registration and resubmit it. ... Fields that require updates display a warning icon and a brief description of the issue."

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-tfn-rejection-reason.html). Rejection reasons most relevant to an individual:

- "Invalid Company Info | The company information you provided is unable to be verified. In order to be verified please confirm your company website is valid and aligns with your company name and address."
- "Invalid Business Connection | The contact information and company/application information does not have a clear connection."
- "Invalid Privacy Policy URL | The Privacy Policy URL provided is missing, inaccessible, or does not contain a valid privacy policy relevant to your business."
- "Non Compliant Use Case | The use case and/or message samples provided are considered restricted content under US Telecom regulations."

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-request.html). The number bills while you wait: "You are still billed the recurring monthly lease fee for the phone number regardless of registration status." And: "Your phone number or sender ID can't send messages until your registration has been approved."

CONFIRMED (registrations-tfn.html). A registered number is tied to its use case: "If a TFN is used for anything other than the specified use case, it can be revoked."

---

## 2. AWS 10DLC registration

Source: https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-10dlc-company.html

CONFIRMED. A brand (company) must be registered first: "Before you can request a 10DLC phone number, you must register your company or brand. Brand registrations are managed by an industry organization called the Campaign Registry."

CONFIRMED. Required fields include: "For **Legal company name**, enter the name that the company is registered under. The name that you enter must be an exact match for the company name that's associated with the tax ID that you provide." / "For **Tax ID or Business Registration Number**, enter your company's tax ID." / "If you're registering a US or non-US entity that has an IRS Employer Identification Number (EIN), enter your nine-digit EIN. The legal company name, EIN, and physical address that you enter must all match the company information that is registered with the IRS." Also a "**Legal form of organization**", a physical business address, a brand verification email whose "domain must match the domain of your business", a vertical, a company website, a support email and a support phone number.

Does a Sole Proprietor brand exist on AWS? NOT FOUND, and the evidence points to no:

- The brand form page names only these legal forms: "PUBLIC\_PROFIT" / "**Public for profit**", "**Private for-profit**", "**US government**" and "**Not-for-profit**". The words "sole proprietor" do not appear on the brand form page, the 10DLC overview, the setup page or the campaign form page. The page does not print the full drop-down, so I cannot prove the option is absent from the live console.
- CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-10dlc-register-campaign.html). The campaign use case list is: Account Notifications, Charity, Customer care, Delivery notifications, Fraud alert messaging, Higher education, Low Volume, Marketing, Mixed, Public service announcement, Polling and voting, Security alert, Two factor authentication. There is no Sole Proprietor campaign type.
- CONFIRMED (https://aws.amazon.com/end-user-messaging/pricing/). The fee list has only "Company registration: $4.50 one-time fee per company", a public-profit authentication fee and vetting. No sole proprietor fee line.

Is an EIN mandatory? The page does not use the word "mandatory". It presents the tax ID as a field to fill, gives no alternative for a US registrant without one, and the review criteria page says: CONFIRMED "EIN is valid and belongs to the registering entity" and "Legal business name matches state or federal records" (registration-help-review-criteria.html). The AWS best-practice blog (dated 31 OCT 2024, https://aws.amazon.com/blogs/messaging-and-targeting/10dlc-registration-best-practices-to-send-sms-with-amazon-pinpoint/) says: CONFIRMED "Dependent on the country in which you have a Tax ID, enter into the Tax ID field one of the following: US=EIN CA=BN Other=VAT".

Personal use on 10DLC is explicitly rejected: see the "Personal or P2P use case detected" quote in 1.4 ("not permitted for A2P 10DLC").

Costs, CONFIRMED (pricing page): "Company registration: $4.50 one-time fee per company." / "10DLC campaign monthly: $10 per regular 10DLC campaign, $2 per low-volume 10DLC campaign." / "10DLC phone number monthly: $1 per 10DLC phone number." Timing, CONFIRMED (registrations-10dlc.html table): brand "1-2 business days", campaign "Up to 4 weeks", number "Up to 10 days".

---

## 3. Anything else on AWS that can deliver an SMS to a US mobile

### 3.1 Amazon SNS SMS: needs the same registered number? Yes.

CONFIRMED (https://docs.aws.amazon.com/sns/latest/dg/channels-sms-originating-identities-long-codes.html). "Effective August 31, 2023, a dedicated number such as a 10DLC number or a toll-free number is required to send SMS text messages to the United States and its territories (Puerto Rico, Guam, American Samoa Islands and the US Virgin Islands)."

CONFIRMED (https://docs.aws.amazon.com/sns/latest/dg/channels-sms-originating-identities.html). "Amazon SNS has integrated with AWS End User Messaging SMS for the delivery of SMS messages."

CONFIRMED (https://docs.aws.amazon.com/sns/latest/dg/sns-mobile-phone-number-as-subscriber.html). "All origination ID related configurations (creation, configuration updating, provisioning new origination IDs, changing registration templates) use AWS End User Messaging SMS."

CONFIRMED (same long-codes page). An ordinary long code is not a way round it: "P2P long codes aren't supported for A2P communications to US destinations." The text names "appointment reminders" as A2P.

SNS is the same route as section 1 with a different API in front. Same registration, same price list.

### 3.2 The SMS sandbox: can a verified number get texts without a registered number? No.

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/sandbox.html). The US-specific rule: "The rules and restrictions for sending SMS and MMS messages to each destination country apply. For example, to send a message to a recipient in the United States, you must first request and register a US number."

CONFIRMED (same page). Sandbox limits: "You have a monthly SMS spending limit of $1.00 (USD)." / "You can send SMS and MMS messages only to verified destination phone numbers. You can add up to 10 verified numbers."

CONFIRMED (https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox-verifying-phone-numbers.html). SNS says the same: "Similar to accounts outside of the SMS sandbox, an origination ID is necessary before you can send SMS messages to recipients in some countries or regions."

My inference, not an AWS statement: once a toll-free number is registered, this use (one verified recipient, 10 to 40 single-part texts at about $0.012 each) would fit inside the sandbox limits without requesting production access. The sandbox does not remove the registration step.

### 3.3 Short codes

CONFIRMED (pricing page). "Dedicated short codes | Country | One-time setup fee | Monthly fee | Estimated provision time ... United States $650 $995 12 weeks". Registration "includes brand vetting by the US Short Code Registry" (https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-us-short-code.html). Not a realistic route.

### 3.4 Simulator numbers

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/test-phone-numbers.html). They never reach a real phone: "The simulator phone numbers are designed to stay within AWS End User Messaging SMS, so that messages are not sent over the carrier network." And: "When you use a simulator phone number as the origination identity you can only send messages to the destination simulator phone number from the same country."

CONFIRMED (pricing page). "Simulator numbers can be purchased in the AWS End User Messaging SMS console for a monthly lease price of $1." Useful for testing delivery events only.

### 3.5 Notify (new in 2026): no registration, but one-time codes only

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/notify.html; added "March 31, 2026" per the document history). "With Notify, you can start sending code verification messages in minutes without provisioning phone numbers, managing sender IDs, or navigating carrier registration processes."

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/notify-templates.html). It cannot carry a reminder: "You select from available templates but cannot create or modify them." / "Template type: The use case category. Currently, `CODE_VERIFICATION` is available."

CONFIRMED (notify.html). "Use standard AWS End User Messaging SMS sending (`SendTextMessage`, `SendVoiceMessage`) when you need custom message bodies".

Notify is closed to this use: the text of a reminder cannot be sent through it.

### 3.6 Per-message and monthly cost of the toll-free route

CONFIRMED (pricing page). "Toll-free numbers can be purchased on the AWS End User Messaging console with a monthly lease price of $2."

CONFIRMED (AWS price file linked from the pricing page, `End-User-Messaging-SMS-Prices...csv`). Rows: "US,United States,All Networks,Toll free,0.00774" and "US,United States,All Networks,Toll free carrier fee,0.00421". The 10DLC rows are the same two figures; short code is 0.00774 plus 0.00417.

My arithmetic: $0.01195 per message part. 40 one-part texts a month is about $0.48, so about $2.50 a month in total. No registration fee is listed for toll-free.

NOT FOUND: a price for inbound SMS on a US toll-free number. The pricing page text and the price file list outbound prices only (the page does list inbound prices for RCS, not for SMS).

---

## 4. Delivery receipts and two-way SMS on toll-free numbers

### 4.1 Delivery events

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/configuration-sets-event-destinations.html). "An _event destination_ is a location (such as a CloudWatch Group, a Amazon Data Firehose stream, or an Amazon SNS topic) that SMS and voice events are sent to." You attach it to a configuration set and name that set when sending.

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/configuration-sets-event-types.html). Event types include "**TEXT\_DELIVERED (Delivered)** – Sends all SMS delivery events to the specified destination." / "**TEXT\_SUCCESSFUL (Successful)** – Success events occur when the message is accepted by the recipient's carrier." / "**TEXT\_CARRIER\_BLOCKED**", "**TEXT\_BLOCKED**", "**TEXT\_UNREACHABLE**", "**TEXT\_SPAM**", "**TEXT\_UNKNOWN**".

CONFIRMED, two limits to design around:

- "Depending on the destination country the **TEXT\_DELIVERED** and **TEXT\_SUCCESSFUL** events may be used interchangeably." (event types page). The event format page defines "**SUCCESSFUL** – The message has been accepted by the phone carrier." and "**DELIVERED** – The message has been accepted by the recipient's device." NOT FOUND: a statement of which one a US toll-free number yields.
- "Events or Delivery Receipts (DLR) generated by carriers can take up to 72 hours to be received and should not be used to determine if there is a delay in outbound message delivery. After 72 hours, if AWS End User Messaging SMS has not received a final event from a carrier, the service will automatically return an UNKNOWN `messageStatus`".

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/what-is-sms-mms.html). Events are not on by default: "The SMS and Voice v2 API doesn't automatically emit event data for the messages that you send."

### 4.2 Inbound replies

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/two-way-sms.html). "When one of your customers sends a message to your phone number, the message body is sent to an Amazon SNS topic or Connect Customer for processing."

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-sms-by-country.html). United States row, under the column "Supports two-way SMS": "Yes".

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/two-way-sms-phone-number.html). Toll-free is named as a two-way number type: "use a standard phone number such as a toll-free number, long code, short code, or 10DLC number." The phone number types page also recommends, for two-way use at "**1–3 message parts per second**: Use a toll-free number."

CONFIRMED (https://docs.aws.amazon.com/sms-voice/latest/userguide/two-way-sms-payload.html). The SNS payload carries `originationNumber`, `destinationNumber`, `messageKeyword`, `messageBody`, `inboundMessageId` and `previousPublishedMessageId` ("The unique identifier of the message that the customer is responding to.").

CONFIRMED (two-way-sms.html). "Inbound SMS messages are not guaranteed to arrive in the order they were sent."

---

## 5. AWS voice as a fallback

### 5.1 End User Messaging voice (text to speech call)

CONFIRMED. It still exists and is offered to new accounts under the End User Messaging name. Pinpoint end-of-support page (https://docs.aws.amazon.com/pinpoint/latest/userguide/migrate.html): "Support for Amazon Pinpoint ended on October 30, 2026." / "SMS, voice, and email sending continue for existing customers only. New customers can use AWS End User Messaging for SMS and voice". / "APIs related to SMS, voice, mobile push, OTP, and phone number validate are not impacted by this change and are supported by AWS End User Messaging."

CONFIRMED (https://docs.aws.amazon.com/pinpoint/latest/apireference_smsvoicev2/API_SendVoiceMessage.html). "Allows you to send a request that sends a voice message. This operation uses Amazon Polly to convert a text script into a voice message."

CONFIRMED (sandbox.html, voice sandbox). "You have a daily limit of 20 messages." / "You can send a maximum of five voice messages to a single recipient during a 24-hour period." / "The maximum voice message length is 30 seconds." Verified destination numbers apply in the voice sandbox too (https://docs.aws.amazon.com/sms-voice/latest/userguide/verify-destination-phone-number.html: "When your account is in the SMS/MMS or voice sandbox you can only send messages to verified destination phone numbers."). Out of the sandbox the length limit is "5 minutes" (quotas page).

CONFIRMED (event types page). Call outcome events exist: "**VOICE\_ANSWERED**", "**VOICE\_NO\_ANSWER**", "**VOICE\_BUSY**", "**VOICE\_FAILED**", and "**VOICE\_COMPLETED (Completed)** – Completed events occur when the audio message is played to the recipient. This status doesn't necessarily mean that the message was delivered to a human recipient. For example, it could indicate that the message was delivered to a voicemail system."

CONFIRMED (pricing page). Outbound voice: "United States 0.013" (USD per minute).

The catch is the origination number. The sources conflict and do not settle whether an individual can get a voice-capable US number without registration:

- Pricing page: "To send voice messages using AWS End User Messaging, you must obtain at least one dedicated, voice-enabled long code."
- Voice countries page (https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-voice-support-by-country.html): "United States | No" under "Local address required?", with "If the value ... is _No_, you can lease local phone numbers directly through the AWS End User Messaging SMS console."
- Long code page (https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-request-long-code.html): the console/API long code list does not include the United States, and "Long codes provisioned through the console or API are provisioned with **SMS capability only**. If you need voice capability on a long code, you must create a support case".
- Toll-free numbers "support both SMS, MMS, and voice messages" (registrations.html), and a 10DLC number's "(SMS, MMS, or VOICE)" capabilities "are specified in the 10DLC registered campaign" (phone-numbers-request.html).
- NOT FOUND: whether a toll-free number that is still unregistered (or was rejected) may place voice calls. The docs say such a number "can't send messages until your registration has been approved" without saying whether that covers voice.

Verdict for this sub-route: undocumented. It is technically offered, but getting a voice-capable US number as an individual is not clearly documented either way.

### 5.2 Amazon Connect (now branded "Amazon Connect Customer")

CONFIRMED (https://docs.aws.amazon.com/connect/latest/APIReference/API_StartOutboundVoiceContact.html). An unattended call is possible: "Places an outbound call to a contact, and then initiates the flow. It performs the actions in the flow that's specified". No agent is needed: "Agents do not initiate the outbound API, which means that they do not dial the contact." A flow can speak text. Default ring timeout "60 seconds". "Campaign calls are not allowed by default" (that concerns `TrafficType` = `CAMPAIGN`, which this use does not need).

CONFIRMED (https://docs.aws.amazon.com/connect/latest/adminguide/phone-number-requirements.html, United States section). No business documents to claim a US number: "Local telephone numbers | No" and "Toll-free prefixes | No" under "Are there ID requirements?".

CONFIRMED (https://docs.aws.amazon.com/connect/latest/adminguide/amazon-connect-service-limits.html). "Phone numbers per instance | 10", with the warning "It's possible to get an error message that "You've reached the limit of Phone Numbers," even if it's the first time you've claimed a phone number. All the issues that cause this error message require help from Support to resolve."

CONFIRMED (https://aws.amazon.com/products/connect/customer/pricing/appendix/). "Outbound voice usage – per minute $0.018"; from the page's worked examples: "a day charge for use of a US DID number in US-WEST-2. At $0.030 per day" and "The outbound call per minute charge to call a US destination. At $0.0048 per minute". The main pricing page (https://aws.amazon.com/connect/pricing/) shows a different headline rate: "Voice $0.038 per voice min (standard telephony rates apply)". I did not resolve which rate a new small instance pays.

My arithmetic on the lower rates: about $0.90 a month for the number plus about $0.023 per one-minute call; 40 calls is roughly $1.80 a month in total.

NOT FOUND: any statement that Connect is limited to businesses, and any statement about whether calls from a newly claimed number are labelled as spam by US carriers.

Voice calls are a separate channel from SMS: this meets "unattended and scheduled" and "know the outcome" (answered or not), but not "arrive as ordinary texts" and not "replies reach the app".

---

## 6. Azure and Google Cloud

### 6.1 Azure Communication Services: closed to new customers, and being retired

CONFIRMED (https://learn.microsoft.com/en-us/azure/communication-services/acs-retirement-and-breaking-changes-guide, page updated 2026-10-29). "On September 23, 2026, Microsoft announced the retirement of Azure Communication Services (ACS) as a standalone offering, effective September 30, 2028."

CONFIRMED (same page). SMS is in the "Retired" list ("ACS SMS"), with migration row "SMS | Retirement | - | - | Blip, Infobip, Telesign".

CONFIRMED (same page). New customers cannot get a number: "Restrictions on retiring services will begin with limiting onboarding for customers without an Azure Communication Services resource created before October 23, 2026. These customers will not be able to acquire phone numbers for retiring telephony workloads, including PSTN calling and SMS." And: "You can acquire new phone numbers only if you're an existing customer with ACS resources that have existing ACS phone numbers."

That closes Azure regardless of its registration rules. For the record, the rules as documented today:

- CONFIRMED (https://learn.microsoft.com/en-us/azure/communication-services/concepts/numbers/phone-number-management-for-united-states). US number types: Toll-Free, Local "(via 10DLC)", Short code. "To acquire a phone number, you need to be on a paid Azure subscription. You can't acquire phone numbers using Azure free credits."
- CONFIRMED (https://learn.microsoft.com/en-us/azure/communication-services/concepts/sms/sms-faq). Toll-free: "Effective _January 31, 2024_, only fully verified toll-free numbers can send traffic." Timing: "The whole toll-free verification process takes about _five to six weeks_."
- CONFIRMED (same FAQ, and https://learn.microsoft.com/en-us/azure/communication-services/concepts/sms/ten-digit-long-code-guidelines). Azure documents a Sole Proprietor 10DLC brand: "**Sole Proprietor**: For individuals or small businesses that don't have an EIN. Limited to one campaign and low message volume. Requires alternative identity verification, like a mobile phone bill." And: "EIN/Tax ID | Employer identification number or tax ID (required for non-Sole Proprietor entities)".
- Conflict inside Azure's own docs: the step-by-step brand form (https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/sms/apply-for-ten-digit-long-code) lists "**EIN**: Enter your EIN." with no sole proprietor branch described.
- CONFIRMED (https://learn.microsoft.com/en-us/azure/communication-services/concepts/sms/toll-free-verification-guidelines). Toll-free verification "is meant for the end business actually sending the message traffic". NOT FOUND on that page or the FAQ: a business registration number field, a sole proprietor option for toll-free, or any statement on personal use.
- Delivery reports and inbound exist: "Azure Communication Services customers can use Azure Event Grid to receive incoming messages." / "inspect the `deliveryStatus` field of your delivery report" (SMS FAQ).
- Azure SMS prices: not checked, since the route is closed.

### 6.2 Google Cloud: no first-party general SMS sending product found

I cannot quote a page that says "Google Cloud has no SMS API"; a negative has no primary source. What I found on Google's own pages is three narrow features, none of which sends an arbitrary text to an arbitrary person:

- CONFIRMED (https://docs.cloud.google.com/monitoring/support/notification-options). Cloud Monitoring can text an alert to a verified number, with the warning: "SMS isn't a fully reliable notification channel type, and it might not be available in certain regions. Whenever you use an SMS notification channel, also use a different notification channel type as a backup." The content is an alert notification in Google's format, not a message you write.
- CONFIRMED (https://docs.cloud.google.com/contact-center/ccai-platform/docs/SMS). The contact-center product has SMS: "For pricing and implementation contact Support." It states US numbers "have to follow the national 10 DLC (Digit Long Code) compliance process", which "requires businesses to register their brand and campaigns with "The Campaign Registry"". This is an enterprise contact-center feature, not a send API.
- CONFIRMED (https://firebase.google.com/docs/auth/web/phone-auth). Firebase sends sign-in codes only: "You can use Firebase Authentication to sign in a user by sending an SMS message to the user's phone. The user signs in using a one-time code contained in the SMS message."

A web search for a Google Cloud SMS sending product returned only these and third-party provider tutorials. Verdict: none found.

---

## 7. First-hand reports, 2025/2026 (all ANECDOTE)

### 7.1 Personal, non-commercial toll-free registration on AWS: denied three times

ANECDOTE. re:Post question dated 2026-10-09, "US Toll-Free Registration repeatedly denied for 'Non Compliant Use Case' with no specific feedback". https://repost.aws/questions/QUyMDjwXeeSX6gOnaOMY8g5A/us-toll-free-registration-repeatedly-denied-for-non-compliant-use-case-with-no-specific-feedback

The poster's own words: "My actual use case: personal, non-commercial home automation project. Sole proprietor sending one-way SMS status notifications only to two phone numbers I personally own (irrigation status, home sensor readings). Under 100 messages/month."

Denial history as the poster lists it: "Company Verification Failed (resolved by adding EIN and business registration document, correcting Company Name to match legal name on IRS records)", then "Invalid field value (resolved, specific feedback said one message sample needed a brand name)", then "Non Compliant Use Case — "Use case and/or message samples are considered restricted or disallowed by mobile operators." No specific field or phrase identified.", then the same denial again.

Points to note. This poster had an EIN and still was not approved as of the post. "Company Verification Failed" appeared before the EIN was added, which is the only report I found of how a sole proprietor registration fares at company verification. The only answer is from "re:Post Agent" (the automated answerer), not AWS staff, and it gives no ruling. No outcome is recorded after 9 October 2026.

### 7.2 Individual trying 10DLC on AWS with an SSN: rejected

ANECDOTE. re:Post question dated 2025-05-24, "How to register a 10DLC brand as an individual?". https://repost.aws/questions/QUPhGuPvTfTSuiGLZUn9uhZQ/how-to-register-a-10dlc-brand-as-an-individual

Poster: "I want to send alert text messages to myself. ... the application asks for information that I don't have because I am not operating as a company. For example, a Tax ID. I tried using my SSN but it got rejected."

The only answer is from "re:Post Agent" (automated, not AWS staff): "The process is not designed for personal use cases like sending alert messages to yourself." Treat that sentence as a pointer, not as AWS policy.

### 7.3 New EIN failing AWS brand verification

ANECDOTE. re:Post question dated 2025-04-29, "AWS End User Messaging Invalid tax ID". https://repost.aws/questions/QUbsQ1fNeDSCC6OUWolz6IMw/aws-end-user-messaging-invalid-tax-id

Poster: "Invalid tax ID / Tax ID not found, or tax ID does not match the provided company information. ... I did register for my ein ID very recently. But it's been about two weeks at this point." An AWS Support account ("AWS Support - Ann") replied only that the poster could "open a case with our Account team". This matters if the fallback plan is "get a free EIN": a fresh EIN may not verify at once. The AWS verification page says the same for toll-free: "Entity not found ... This is common for recently formed businesses or entities not in commercial databases."

### 7.4 Review time in practice

ANECDOTE. re:Post question dated 2026-04-24: "I applied for a Toll-Free number 15 business days ago and I still have not received a decision". https://repost.aws/questions/QURwmzsOLNT6aaBnNMNjLC5A/applied-for-toll-free-15-business-days-ago-still-with-no-decision

### 7.5 What I did not find

NOT FOUND: any 2025/2026 first-hand report of an individual with no business getting an AWS toll-free number approved. NOT FOUND: any Reddit or Hacker News thread on this for AWS. NOT FOUND: any re:Post answer by AWS staff on whether individuals may register.

---

## Verdict for this part

| Route                                                                    | Open to this person?                                                                                                                                                                                                                                                                                                                                | Cost                                                                                                                                                                          | Strongest single piece of evidence                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS toll-free number (End User Messaging, or SNS in front of it)         | **Undocumented, and risky.** The form has a "Sole proprietor" type that waives the tax ID. No AWS page says a person with no business may use it, and the rest of the form assumes a business (company website, business-relevant privacy policy and terms, support email). The one first-hand report of a personal project was denied three times. | $2 a month for the number, about $0.012 per text; about $2.50 a month at 40 texts. No registration fee. Review "up to 15 business days"; the number bills while pending.      | "Unless you select **Sole proprietor**, the following three company identification fields are required" (registrations-tfn-register.html), set against the 2026-10-09 re:Post report of a personal project denied for "Company Verification Failed" then "Non Compliant Use Case". |
| AWS 10DLC                                                                | **No.** No sole proprietor brand is documented, the brand form asks for an EIN that matches IRS records, and personal messaging is a named rejection reason.                                                                                                                                                                                        | $4.50 once, then $2 a month (low-volume campaign) plus $1 a month (number), plus about $0.012 per text.                                                                       | "The campaign describes personal or peer-to-peer messaging, which is not permitted for A2P 10DLC." (registration-help-rejection-troubleshooting.html)                                                                                                                              |
| Amazon SNS SMS                                                           | **Same as toll-free.** It is not a separate route.                                                                                                                                                                                                                                                                                                  | Same.                                                                                                                                                                         | "a dedicated number such as a 10DLC number or a toll-free number is required to send SMS text messages to the United States" (SNS long codes page)                                                                                                                                 |
| AWS SMS sandbox with a verified destination number, no registered number | **No.**                                                                                                                                                                                                                                                                                                                                             | n/a                                                                                                                                                                           | "to send a message to a recipient in the United States, you must first request and register a US number." (sandbox.html)                                                                                                                                                           |
| AWS short code                                                           | **No** in practice.                                                                                                                                                                                                                                                                                                                                 | $650 setup, $995 a month, 12 weeks.                                                                                                                                           | Pricing page table: "United States*** $650 $995 12 weeks".                                                                                                                                                                                                                         |
| AWS simulator numbers                                                    | **No.** They never reach a real phone.                                                                                                                                                                                                                                                                                                              | $1 a month.                                                                                                                                                                   | "designed to stay within AWS End User Messaging SMS, so that messages are not sent over the carrier network" (test-phone-numbers.html)                                                                                                                                             |
| AWS Notify (no registration needed)                                      | **No.** One-time-code templates only.                                                                                                                                                                                                                                                                                                               | From $0.045 per message plus channel fee.                                                                                                                                     | "Currently, `CODE_VERIFICATION` is available." (notify-templates.html)                                                                                                                                                                                                             |
| AWS delivery receipts and replies (if a toll-free number is approved)    | **Yes**, both exist. Delivery events go to SNS, Firehose or CloudWatch; replies go to an SNS topic. Final status can take up to 72 hours and may be "UNKNOWN".                                                                                                                                                                                      | Inbound SMS price NOT FOUND.                                                                                                                                                  | "the message body is sent to an Amazon SNS topic" (two-way-sms.html); "**TEXT\_DELIVERED (Delivered)**" (event types page)                                                                                                                                                         |
| AWS End User Messaging voice call                                        | **Undocumented.** The API is offered to new accounts, but how an individual gets a voice-capable US number without registration is not clear; the docs conflict.                                                                                                                                                                                    | $0.013 a minute plus the number's monthly fee.                                                                                                                                | "you must obtain at least one dedicated, voice-enabled long code" (pricing page) against "Long codes provisioned through the console or API are provisioned with **SMS capability only**" (long code page).                                                                        |
| Amazon Connect automated outbound call                                   | **Yes, as documented**: no ID is required for a US number and the API places an unattended call that runs a flow. It is a voice call, not a text, and replies do not apply.                                                                                                                                                                         | About $0.90 a month for a number plus about $0.023 per one-minute call, on the lower published rates; the headline rate on the main pricing page is higher ($0.038 a minute). | "Local telephone numbers                                                                                                                                                                                                                                                           | No" under "Are there ID requirements?" (Connect phone number requirements, United States) |
| Azure Communication Services SMS                                         | **No.** New customers cannot buy numbers since 23 October 2026, and the service retires 30 September 2028.                                                                                                                                                                                                                                          | Not checked.                                                                                                                                                                  | "These customers will not be able to acquire phone numbers for retiring telephony workloads, including PSTN calling and SMS." (Azure retirement guide)                                                                                                                             |
| Google Cloud                                                             | **No.** No first-party general SMS sending product found.                                                                                                                                                                                                                                                                                           | n/a                                                                                                                                                                           | Only alert texts (Cloud Monitoring: "SMS isn't a fully reliable notification channel type"), sign-in codes (Firebase) and a contact-center feature that itself requires 10DLC registration.                                                                                        |

Bottom line for this part. No big-cloud route is documented as open to a person with no business who wants to text a family member. The nearest is the AWS toll-free "Sole proprietor" type, which waives the tax ID on paper; AWS neither permits nor forbids personal use of it in writing, and the single first-hand report is three denials. An automated Amazon Connect voice call is the only route here that AWS documents as needing no business identity, and it is a call, not a text.
