import { defineAuth } from '@aws-amplify/backend';

/**
 * Email and password, with no second step: Susan cannot manage a code. Self sign-up is turned off
 * in `backend.ts`; the owner creates every account by hand (README, "Accounts"), gives it a display
 * name (the `name` attribute) and adds each Admin's account to the `Admins` group. The one account
 * outside that group is Susan's.
 *
 * The group only decides who receives Alerts, passed-on Replies and Activity updates. It grants no
 * extra rights: everyone signed in can do everything.
 */
export const auth = defineAuth({
  loginWith: { email: true },
  userAttributes: { fullname: { required: true, mutable: true } },
  groups: ['Admins'],
  accountRecovery: 'EMAIL_ONLY',
});
