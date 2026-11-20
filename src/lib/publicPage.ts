// The pages anyone can open without signing in, and the two values the owner sets for them at
// deploy. Shared by the app and the backend.

export type PublicPageName = 'about' | 'privacy' | 'terms';

/** Each public page's address. People may keep or pass on these addresses, so they must not change. */
export const PUBLIC_PATHS: Record<PublicPageName, string> = {
  about: '/about',
  privacy: '/privacy',
  terms: '/terms',
};

/** The public page at an address, or null when the address needs a sign-in. */
export function publicPageAt(pathname: string): PublicPageName | null {
  // A reviewer may retype an address, so capitals and a closing slash make no difference.
  const path = pathname.replace(/\/$/, '').toLowerCase();
  const page = (Object.keys(PUBLIC_PATHS) as PublicPageName[]).find(
    (name) => PUBLIC_PATHS[name] === path,
  );
  return page ?? null;
}

/**
 * The contact address shown on the public pages, from the CONTACT_EMAIL setting, or null when it
 * isn't set. A value that isn't an email address is refused: it would be published as a dead link.
 */
export function resolveContactEmail(configured: string | undefined | null): string | null {
  const email = configured?.trim();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error(
      `CONTACT_EMAIL is not an email address: "${email}". Use one such as owner@example.com.`,
    );
  return email;
}

/** Who runs the calendar, as the public pages name them, from the OWNER_NAME setting, or null. */
export function resolveOwnerName(configured: string | undefined | null): string | null {
  return configured?.trim() || null;
}
