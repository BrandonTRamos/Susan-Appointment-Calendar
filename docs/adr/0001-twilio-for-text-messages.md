---
status: accepted
---

# Text messages are sent through Twilio, not AWS

Everything else in this app runs on AWS, but Reminders and Change notices are sent through Twilio, from a dedicated number registered under Twilio's "Sole Proprietor" A2P 10DLC brand. We chose it in November 2026 because US carriers require a sending number to be registered, the app's owner is a private individual with no business or EIN, and Twilio's was the only registration documented as open to such a person; text messages are the app's critical feature, so a certain approval outweighed keeping to one cloud.

## Considered options

- **AWS End User Messaging, 10DLC number.** Ruled out: the brand registration form requires an EIN or other business tax ID.
- **AWS End User Messaging, toll-free number registered as "Sole proprietor".** Cheaper ($2 a month, no one-time fee) and all-AWS, but no AWS documentation says a non-business individual qualifies, and review takes up to 15 business days, so a rejection would cost about three weeks. The AWS SMS sandbox does not avoid this: sending to any US number requires a registered number first.
- **Applying to both and preferring AWS if approved.** Rejected by the owner in favour of a single provider.
- **Sending from the owner's own phone number.** Not possible through a provider, which can only send from numbers it holds. Sending from the owner's own device would make Reminders depend on that device staying on and would leave the app unable to tell whether a text was delivered.

## Consequences

- The app holds Twilio credentials as a secret and has a recurring cost outside the AWS bill (about $20 once, then about $4 to $5 a month at expected volume).
- Twilio's Sole Proprietor brand allows one campaign and one number. That fits one recipient; it would not fit texting Drivers or Admins.
- Registration needs a public page with a privacy policy and terms, and a dated record of Susan's verbal consent.
- If the owner later has an EIN, or AWS documents individual eligibility, moving to AWS is worth reconsidering. The sending step should stay behind a single seam so that switch is small.
