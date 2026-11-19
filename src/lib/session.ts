// Session decisions for the sign-in boundary (src/SignedIn.tsx). Never display account identifiers.

/** The signed-in person. */
export interface SignedInPerson {
  /** The account's permanent ID in the identity system. Never shown. */
  id: string;
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
function displayName(claims: Record<string, unknown>, id: string): string | null {
  const identifiers = [
    id,
    claims.sub,
    claims.email,
    claims.phone_number,
    claims['cognito:username'],
  ]
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.toLowerCase());
  const raw = claims.name;
  if (typeof raw !== 'string' || /\p{Cc}/u.test(raw)) return null;
  const name = raw.trim().replace(/\s+/gu, ' ');
  if (!name || name.length > 80 || !/\p{L}/u.test(name) || /[<>@]|:\/\//u.test(name)) return null;
  if (identifiers.includes(name.toLowerCase())) return null;
  if (/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(name)) return null;
  if (/^[\w-]+\.[\w-]+\.[\w-]+$/u.test(name)) return null;
  return name;
}

/** Identity and display name come from the same authenticated snapshot. Inconsistent tokens fail closed. */
export function signedInPerson(snapshot: Snapshot): SignedInPerson | null {
  if (!snapshot.tokens?.accessToken) return null;
  const accessSub = snapshot.tokens.accessToken.payload?.sub;
  const claims = snapshot.tokens.idToken?.payload ?? {};
  const id = snapshot.userSub ?? accessSub;
  if (typeof id !== 'string' || !id) return null;
  if (
    (accessSub !== undefined && accessSub !== id) ||
    (claims.sub !== undefined && claims.sub !== id)
  )
    return null;
  return { id, displayName: displayName(claims.sub === id ? claims : {}, id) };
}
