// Session decisions for the sign-in boundary (src/SignedIn.tsx). Never display account identifiers.

/** The signed-in person. */
export interface SessionUser {
  userId: string;
  /** From the account's `name` attribute, which the owner fills in when creating the account. */
  displayName: string | null;
}

interface Snapshot {
  userSub?: string;
  tokens?: {
    accessToken?: { payload?: { sub?: unknown } };
    idToken?: { payload?: Record<string, unknown> };
  };
}

/** Only definitive authentication errors require new credentials; network/service errors can retry. */
export function invalidSession(error: unknown): boolean {
  let cause = error;
  for (let depth = 0; depth < 4 && cause && typeof cause === 'object'; depth++) {
    const e = cause as { name?: unknown; cause?: unknown; underlyingError?: unknown };
    if (
      typeof e.name === 'string' &&
      [
        'UserUnAuthenticatedException',
        'NotAuthorizedException',
        'TokenRevokedException',
        'UserNotFoundException',
        'PasswordResetRequiredException',
        'UserNotConfirmedException',
        'RefreshTokenReuseException',
      ].some((name) => e.name === name || (e.name as string).startsWith(`${name}:`))
    )
      return true;
    cause = e.underlyingError ?? e.cause;
  }
  return false;
}

/** The `name` claim only: never substitute email, phone, Cognito username or subject. */
function profileName(claims: Record<string, unknown>, userId: string): string | null {
  const identifiers = [
    userId,
    claims.sub,
    claims.email,
    claims.phone_number,
    claims['cognito:username'],
  ]
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.toLowerCase());
  for (const raw of [claims.name]) {
    if (typeof raw !== 'string' || /\p{Cc}/u.test(raw)) continue;
    const name = raw.trim().replace(/\s+/gu, ' ');
    if (!name || name.length > 80 || !/\p{L}/u.test(name) || /[<>@]|:\/\//u.test(name)) continue;
    if (identifiers.includes(name.toLowerCase())) continue;
    if (/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(name)) continue;
    if (/^[\w-]+\.[\w-]+\.[\w-]+$/u.test(name)) continue;
    return name;
  }
  return null;
}

/** Identity and profile name come from the same authenticated snapshot. Inconsistent tokens fail closed. */
export function sessionUser(snapshot: Snapshot): SessionUser | null {
  if (!snapshot.tokens?.accessToken) return null;
  const accessSub = snapshot.tokens.accessToken.payload?.sub;
  const claims = snapshot.tokens.idToken?.payload ?? {};
  const userId = snapshot.userSub ?? accessSub;
  if (typeof userId !== 'string' || !userId) return null;
  if (
    (accessSub !== undefined && accessSub !== userId) ||
    (claims.sub !== undefined && claims.sub !== userId)
  )
    return null;
  return { userId, displayName: profileName(claims.sub === userId ? claims : {}, userId) };
}
