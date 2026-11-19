import { defineAuth } from '@aws-amplify/backend';

/** The group that marks an account as an Admin's. The one account outside it is Susan's. */
export const ADMIN_GROUP = 'Admins';

/**
 * Email and password, with no second step: Susan cannot manage a code. Self sign-up is turned off
 * in `backend.ts`; the owner creates every account in the Cognito console, gives it a display name
 * (the `name` attribute) and adds each Admin's account to the Admins group.
 *
 * The group only decides who receives Alerts, passed-on Replies and Activity updates. It grants no
 * extra rights: everyone signed in can do everything.
 */
export const auth = defineAuth({
  loginWith: { email: true },
  userAttributes: { fullname: { required: true, mutable: true } },
  groups: [ADMIN_GROUP],
  accountRecovery: 'EMAIL_ONLY',
});
