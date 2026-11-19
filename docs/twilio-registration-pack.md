# Twilio registration pack

Everything the owner needs to register with Twilio as the sender of Susan's texts (ticket 05) and to get her agreement on record: what to type in each field, the words to read to Susan, and the text that confirms her answer. It follows ADR 0001 (`docs/adr/0001-twilio-for-text-messages.md`).

Twilio's forms sit behind a login, so the field names below come from Twilio's published guides, checked on 19 November 2026. Where the screen differs from this pack, the guide linked at that step is the authority. Sources are listed at the end.

Replace these wherever they appear:

| Placeholder        | Put in                                                                                |
| ------------------ | ------------------------------------------------------------------------------------- |
| `[app address]`    | The app's address without `https://`, as written in the README once ticket 03 is done |
| `[Your full name]` | Your first and last name, exactly as you give them to Twilio and in `OWNER_NAME`      |

Never type Susan's surname or her phone number into a registration field, and never write either in this repository. Twilio's guidance says the same: no real names or numbers of the people being texted.

## Read this first: Twilio may refuse this use

**Ask Twilio Support the question below before paying anything.** Twilio added a rejection reason on 15 September 2026 that names this app's case.

- Error 30532, "Personal use cases are not supported", applies to A2P 10DLC registration. Its text: "Your registration must describe a business use case. Messaging programs used only for personal purposes, such as reaching yourself, family members, or friends, are not eligible." Its first listed cause: "The number was requested to send reminders to yourself, friends, or family members." It adds: "Personal messaging itself is not supported by this registration program; changing only the description does not make it eligible."
- Older Twilio pages, still published, say the opposite. The A2P 10DLC overview describes a Sole Proprietor as "a student, hobbyist, someone working at an organization or someone trying out Twilio messaging products for the first time", and a help article says hobbyist registrations are judged "on a case-by-case basis".
- No Twilio page settles which one reviewers apply to a one-person family reminder app. ADR 0001 chose Twilio because its registration was the one documented as open to a private individual, so this matters to that decision.
- The text in this pack describes the app truthfully. Do not reword it to look like a business: Twilio says that does not make the use eligible, and it would be a false statement on a registration.

The $15 campaign vetting fee is not refunded after a rejection. The question costs nothing. Open a support ticket from the Twilio Console (Help, then Support) and paste:

```text
I am a private individual in the US with no business and no EIN. I have built a small app that sends appointment reminders by text message to one person, an elderly member of my family, who agrees verbally. The messages are composed and sent by software on a schedule (application-to-person), from one 10DLC number.

Your A2P 10DLC overview describes the Sole Proprietor brand as open to hobbyists, but error 30532 (added September 2026) says messaging only family members is not eligible for registration.

Before I pay the campaign vetting fee: would a Sole Proprietor campaign for this use be approved? If not, is there any Twilio sender type I may use for it?
```

If the answer is no, stop here. The decision in ADR 0001 has to be made again, and this pack does not apply.

## What it costs

Prices on 19 November 2026.

| Charge                                     | Amount                     | When                       |
| ------------------------------------------ | -------------------------- | -------------------------- |
| Sole Proprietor brand registration         | $4.50                      | Once                       |
| Campaign vetting                           | $15.00                     | Once; not refunded         |
| **One-time total**                         | **$19.50**                 |                            |
| Sole Proprietor campaign                   | $2.00                      | Each month, from approval  |
| One US local number                        | $1.15                      | Each month                 |
| Each text sent, per segment                | $0.0083                    | As sent                    |
| Carrier fee on each text sent, per segment | $0.0035 to $0.005          | As sent; varies by carrier |
| Each text received (a Reply), per segment  | $0.0083 plus up to $0.0035 | As received                |
| A text that fails                          | $0.001                     | As it happens              |

- A segment is 160 plain characters. A Reminder with a place, a Driver and a Note for Susan is usually two segments, about 2.6 cents.
- **Each month: about $4 to $5.** That is $3.15 fixed, plus roughly $1 to $2 for 40 to 70 Reminders.
- Upgrading the account asks you to load a starting balance. It is not an extra fee: the charges above are drawn from it.
- A rejected campaign can be corrected and resubmitted without paying the vetting fee again, as long as you edit the rejected campaign. Deleting it and creating a new one is charged again.

## Before you start

- [ ] Twilio Support has answered the question above with a yes.
- [ ] Ticket 03 is done: the app is live at `[app address]`.
- [ ] `CONTACT_EMAIL` and `OWNER_NAME` are set on the Amplify app (README, "Environment values") and the app has been redeployed since.
- [ ] `https://[app address]/about` opens in a private browser window, with no sign-in, and shows your name and your contact email address. So do `/privacy` and `/terms`.
- [ ] You have to hand: a payment card, your home address, and your own US mobile phone. It must be a real mobile number, not one from Twilio or a similar service.

## Step 1: The Twilio account

1. Create an account at twilio.com in your own name, with the same email address you will give in the registration.
2. Upgrade it from trial to paid and load a balance.

## Step 2: The Sole Proprietor brand

In the Console, start the A2P 10DLC registration and choose **Sole Proprietor**. The newer Console begins from a phone number's checklist instead; if it asks you to buy a number first, do Step 5 first. Twilio's walk-throughs: [older Console](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview), [newer Console](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview-new%20experience).

| Field                                                 | What to enter                                                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Profile name                                          | `[Your full name]`                                                                                                      |
| First name, last name                                 | Your own                                                                                                                |
| Email address                                         | The address in `CONTACT_EMAIL`. Not a disposable address.                                                               |
| Contact phone number                                  | Your own number                                                                                                         |
| Address                                               | Your home address. It must be a real US address.                                                                        |
| Does the company have a business registration number? | No                                                                                                                      |
| Brand type                                            | Sole Proprietor                                                                                                         |
| Brand name (also "A2P Brand registration name")       | `[Your full name]`. Not "Susan's Calendar": see error 30914 under "If it is rejected".                                  |
| Business vertical or industry                         | Leave empty if the form allows. If it insists, choose Technology: the sender is a piece of software, not a clinic.      |
| Mobile phone number                                   | Your own US mobile. Twilio texts it a code request. One mobile number can be used for at most three such registrations. |
| Agreements                                            | Accept the one-time brand fee and the request to text your mobile                                                       |

## Step 3: The one-time code

A text arrives on your mobile from The Campaign Registry, the body that keeps the register: "Please confirm your registration for US A2P Messaging by replying YES. Msg & data rates may apply." Reply **YES** within 24 hours. The brand is usually approved within minutes after that.

## Step 4: The campaign

Create the campaign under the brand. There is only one use case for this brand type, **Sole Proprietor**. Let Twilio create a new Messaging Service for it, and leave Twilio's default handling of STOP and HELP switched on, so the form does not ask for opt-out or help messages.

Twilio's guide to these fields: [A2P 10DLC Campaign Approval Best Practices](https://help.twilio.com/articles/11847054539547).

### Campaign description

```text
Susan's Calendar is a private appointment calendar run by [Your full name] for one elderly member of the family. Software sends her text message reminders ahead of each of her own appointments, at times set in the calendar: what the appointment is, when and where it is, and who is driving her. It also sends her a notice when an appointment she was already reminded of is moved or cancelled. Messages go to one recipient only, who has agreed verbally. No marketing or promotional content is sent.
```

### Sample messages

Enter all five. Twilio requires at least two, and at least one must carry opt-out wording; the third does.

```text
Susan's Calendar: Eye doctor with [doctor's name], tomorrow (Thursday, March 11) at 10:30 AM, at [clinic name and address]. [Driver's name] will pick you up at 9:45 AM. Bring your glasses.
```

```text
Susan's Calendar: Change: Eye doctor with [doctor's name] has moved from Thursday, March 11 at 10:30 AM to Friday, March 12 at 2:00 PM.
```

```text
Susan's Calendar: You agreed to get text reminders about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help. Reply STOP to unsubscribe.
```

```text
Susan's Calendar: Nobody reads replies sent to this number. If you need help, call [contact's name] at [555-555-5555].
```

```text
Susan's Calendar: Change: Eye doctor with [doctor's name] on Thursday, March 11 at 10:30 AM is cancelled.
```

The first, second and fifth are a Reminder and two Change notices in the order of details the spec gives ("Wording"). Their exact words are settled by tickets 07 and 14. If those tickets are finished before you submit and their wording differs, paste real examples from the app's preview in place of these.

### Message contents

| Question                             | Answer                                                      |
| ------------------------------------ | ----------------------------------------------------------- |
| Messages will include embedded links | No                                                          |
| Messages will include phone numbers  | Yes: the automatic answer to a reply gives a number to call |
| Direct lending or loan arrangement   | No                                                          |
| Age-gated content                    | No                                                          |

### How do end-users consent to receive messages?

```text
Messages go to one person only, an elderly member of the registrant's family. There is no public sign-up: no phone number is collected on the website or by text message. Consent is verbal and is given by the recipient herself. [Your full name] reads her the full consent script in person and she answers yes or no. The script is published at https://[app address]/about, with the terms at https://[app address]/terms and the privacy policy at https://[app address]/privacy. When she says yes, the date is recorded and one confirmation text is sent at once: "Susan's Calendar: You agreed to get text reminders about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help. Reply STOP to unsubscribe." After that she receives reminders of her own appointments. She can reply STOP at any time to end the messages, or HELP for help.
```

- **Newer Console:** choose **Verbal consent** as the primary opt-in method, and paste the consent script from Step 6 into the opt-in proof field.
- **Older Console:** there is no separate proof field. Paste the consent script from Step 6 into this same field, on a new line after the text above. Twilio rejects a verbal opt-in that gives a summary and not the full script.

### Privacy policy and terms

| Field                    | What to enter                   |
| ------------------------ | ------------------------------- |
| Privacy Policy URL       | `https://[app address]/privacy` |
| Terms and Conditions URL | `https://[app address]/terms`   |

### Opt-in keywords and opt-in message

Leave both empty. Nobody opts in by text.

## Step 5: The number

Buy one US local number in the Console, with SMS, in or near Susan's area code so it looks familiar to her. Add it to the campaign's Messaging Service. A Sole Proprietor campaign covers one number only.

## Step 6: Susan's consent

Read the script to Susan yourself, in person, and let her answer for herself. Twilio's rules do not accept consent given by someone else on her behalf.

Do this on the day the confirmation text can be sent: after Twilio has approved the campaign and the number can send (ticket 18). Twilio expects the confirmation to follow consent at once. If more than a few days pass between her yes and that text, read the script again and record the new date.

### The consent script

Read it exactly. It is also shown on `https://[app address]/about`, and Twilio's reviewers compare the two. To change a word, change `src/lib/consent.ts` and this pack together.

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

### The record of her consent

Fill this in and commit it. Twilio can ask for the date and the method.

- Date she agreed: \_\_\_\_\_\_\_\_\_\_\_\_
- Time: \_\_\_\_\_\_\_\_\_\_\_\_
- Read to her by: \_\_\_\_\_\_\_\_\_\_\_\_
- How: in person, with the script above read in full
- Her answer: \_\_\_\_\_\_\_\_\_\_\_\_
- Confirmation text sent on: \_\_\_\_\_\_\_\_\_\_\_\_

### The confirmation text

Send this once, straight after she agrees, from the registered Twilio number and not from your own phone. It must be the first text she gets from that number.

```text
Susan's Calendar: You agreed to get text reminders about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help. Reply STOP to unsubscribe.
```

## While it is under review

- The brand is usually approved within minutes of the YES reply.
- A campaign review takes up to 5 business days. Twilio says Sole Proprietor campaigns are typically decided within hours to days. Contact Support if it is still in progress after 10 days.
- Until the campaign is approved the number cannot send to US mobiles.
- Twilio checks the three addresses automatically by loading them and taking a screenshot. Keep the pages live and unchanged while the review runs.

## If it is rejected

Write the reason on ticket 05, correct this pack, then edit the rejected campaign and resubmit. Do not delete it. The likeliest reasons:

| Code                  | Meaning                                                            | What to do                                                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 30532                 | Personal use is not supported                                      | Do not resubmit with different wording. Revisit ADR 0001.                                                                                                                                                                                                                                |
| 30914                 | The name in the messages does not match the Sole Proprietor's name | Every text opens "Susan's Calendar:", and the brand is `[Your full name]`. The pages and the description say you run it, which may satisfy a reviewer. If not, the opening words of every text would have to name you, which changes the spec ("Wording"). That is the owner's decision. |
| 30909, 30896          | The description of consent is incomplete                           | Check the full script was pasted and the `/about` address opens without a sign-in.                                                                                                                                                                                                       |
| 30908, 30932          | Privacy policy                                                     | Check `/privacy` opens and still carries the sentence about never sharing mobile numbers and consent.                                                                                                                                                                                    |
| 30882, 30557 to 30563 | Terms                                                              | Check `/terms` opens and still names the service, the frequency, the rates line, STOP, HELP, a contact and the carrier sentence.                                                                                                                                                         |
| 30921, 30536          | A page needs a sign-in or cannot be reached                        | Open all three addresses in a private window. Check the rewrite rule in the README is set.                                                                                                                                                                                               |
| 30919                 | The website says too little                                        | Check `/about` shows your name and contact email; both come from the environment values.                                                                                                                                                                                                 |

## What Twilio's documentation says

Checked on 19 November 2026, as ticket 02 required.

### Opt-out wording: the first message only

Opt-out wording does **not** have to be in every Reminder.

- Twilio's Messaging Policy (last updated 13 April 2026): "The initial message that you send to a recipient needs to include the following language: 'Reply STOP to unsubscribe,' or the equivalent using another standard opt-out keyword". For later messages it is "best practice", not a requirement, to remind the recipient how to unsubscribe.
- The registration needs opt-out wording in at least one sample message. The confirmation text is that sample.
- So the confirmation text carries "Reply STOP to unsubscribe" and the Reminders and Change notices do not. The spec's wording of Reminders is unchanged. This is what the spec hoped for: wording that invites a forgetful person to reply STOP stays out of the texts she reads every week.
- "Msg & data rates may apply" and the HELP instruction are required in the consent script, the confirmation text, the terms and the privacy policy. No Twilio or CTIA statement was found requiring them in every later message.

### Every text must say who it is from

The Messaging Policy requires that "every message that you send via the Twilio Messaging Services must clearly identify you (i.e., the party that obtained the consent from a recipient) as the sender." Every text opens "Susan's Calendar:", as the spec already requires. Whether a reviewer accepts that name for a brand registered as `[Your full name]` is the open risk under error 30914 above.

### What the fields require

- **Brand:** no EIN and a US or Canadian address. One campaign, one number, about 1,000 texts a day to T-Mobile phones, one text a second. No website field.
- **Campaign description:** 40 to 4,096 characters, saying who sends, who receives and why.
- **Sample messages:** at least two, up to five, each 40 to 1,024 characters, naming the sender.
- **Consent description:** 40 to 1,000 characters in the newer Console (the older one allows 2,048), saying where the person is asked, how she agrees and what happens next. For verbal consent the full script is required, and it should also be at a public address.
- **Consent script:** must cover what is sent, how often, "Msg & data rates may apply", HELP, STOP, where the terms and privacy policy are, a clear yes-or-no question, and that a confirmation follows. The script above has each. It is under 1,000 characters when `[app address]` is 40 characters or fewer.
- **Confirmation text:** required for every recurring campaign, immediately after consent, with the programme name, frequency, rates, HELP and STOP. Twilio does not send it; the owner or the app must.
- **Privacy policy:** a page titled "Privacy Policy" that says what is collected and how it is used, names who runs the service, and states that mobile numbers and consent are not shared with third parties for marketing. Sharing with the companies that deliver the messages is allowed.
- **Terms:** a page titled "Terms and Conditions" with the programme name and description, frequency, "Message and data rates may apply", a contact, STOP and HELP in bold, a link to the privacy policy, and "Carriers are not liable for delayed or undelivered messages".
- **Both pages:** on the same site, reachable with no sign-in and no download, at `https://` addresses.

### For later tickets

- **STOP (tickets 13 and 17).** With Twilio's default handling, a text of the single word STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, REVOKE, OPTOUT or QUIT blocks further texts to that phone. Twilio answers it automatically, still passes it to the app, and refuses later sends with error 21610. START, YES or UNSTOP lifts the block.
- **HELP (ticket 17).** Twilio answers HELP and INFO itself ("Reply STOP to unsubscribe. Msg&Data Rates May Apply.") and does not pass them to the app by default, so a HELP from Susan is not a Reply the Admins see. "Advanced Opt-Out" on the Messaging Service lets the HELP answer name a person to call; it can be set only in the Console and cannot be switched off again without Twilio Support.

### Sources

- [Error 30532: Personal use cases are not supported](https://www.twilio.com/docs/api/errors/30532), and [the September 2026 error codes](https://help.twilio.com/articles/15778026827291)
- [Error 30914: Sole proprietor name mismatch](https://www.twilio.com/docs/api/errors/30914)
- [Error 30909: Message flow incomplete](https://www.twilio.com/docs/api/errors/30909) and [error 30921: Website requires authentication](https://www.twilio.com/docs/api/errors/30921)
- [A2P 10DLC overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)
- [Sole Proprietor registration, older Console](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview)
- [Collecting the information for registration](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/collect-business-info)
- [A2P 10DLC Campaign Approval Best Practices](https://help.twilio.com/articles/11847054539547)
- [Twilio Messaging Policy](https://www.twilio.com/en-us/legal/messaging-policy)
- [A2P 10DLC fees](https://help.twilio.com/articles/1260803965530) and [US SMS pricing](https://www.twilio.com/en-us/sms/pricing/us)
- [Sole Proprietor limits](https://help.twilio.com/articles/9550596959643)
- [Twilio's handling of STOP and HELP](https://help.twilio.com/articles/223134027) and [Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out)
- [Troubleshooting and resubmitting campaigns](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/troubleshooting-a2p-brands/troubleshooting-and-rectifying-a2p-campaigns)

Not confirmed from Twilio's pages: how reviewers treat this app in practice (see "Read this first"), the exact labels inside the Console, and whether the automatic check renders pages that need JavaScript. The public pages do need it, like the rest of the app. If the review reports a page as empty or unreachable while it opens in a browser, that is the first thing to suspect.
