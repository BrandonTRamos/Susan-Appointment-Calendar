// Whether words hold a web address. No text to Susan may: Textbelt sends a text holding one only
// once the key has been given leave to (docs/text-message-setup.md), and this one has not. The core
// checks the words of every text at the one place each passes before it is sent, and the screens
// warn where a Reminder's words would hold one. Pure, so that both decide the same way.

/**
 * Generic top-level domains in wide use. Every two-letter one is a country's, and is taken as a
 * domain without being listed. Matched without regard to case.
 */
const GENERIC = new Set(
  [
    // The original ones, and the other long-standing ones.
    'com net org edu gov mil int arpa info biz name pro mobi aero coop museum jobs travel tel asia cat post xxx',
    // Common newer ones.
    'xyz top site online store shop app dev page blog cloud tech club live life world today news',
    'media link click space website email solutions services support center centre group agency',
    'company digital network systems global plus one vip wiki fun icu buzz work bio eco art design',
    'studio photo photos pics video ltd llc inc gmbh zone land direct express social chat bot ai',
    'io me tv co us', // two-letter ones commonly used as generic, listed for whoever reads this
    'health care clinic doctor dental dentist hospital healthcare pharmacy medical surgery vision',
    'fitness yoga salon spa hair church family house home homes city town community events legal',
    'law lawyer attorney bank finance insurance realty properties school academy university',
    'college education gift gifts farm garden pet pets vet dog toys games golf energy london nyc',
  ]
    .join(' ')
    .split(' '),
);

/** A link with its scheme ("https://"), or a "www." address. */
const LINK = /\b[a-z][a-z\d+.-]*:\/\/|\bwww\d{0,3}\./i;

/**
 * A host name ending in a top-level domain, as "example.com", "portal.example.co.uk" or the part of
 * an email address after the "@". The top-level domain is captured; the name before it, too.
 */
const HOST =
  /\b((?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)*([a-z\d](?:[a-z\d-]*[a-z\d])?))\.([a-z]{2,63}|xn--[a-z\d-]+)(?![a-z\d-])/gi;

/**
 * Whether words hold a web address: a link, a "www." address, a host name such as "example.de" or
 * "clinic.example.xyz", or an email address. Ordinary punctuation is not taken for one: a capital
 * letter straight after a full stop starts a sentence ("medicines.Then"), a single letter is an
 * abbreviation ("e.g."), and a number before a two-letter ending is a time or a dose ("10.am").
 */
export function holdsWebAddress(words: string): boolean {
  if (LINK.test(words)) return true;
  for (const [, , name, ending] of words.matchAll(HOST)) {
    const lower = ending.toLowerCase();
    // "Then" in "medicines.Then": a domain is written in one case, a sentence starts with a capital.
    if (ending !== lower && ending !== ending.toUpperCase()) continue;
    if (lower.startsWith('xn--') || GENERIC.has(lower)) return true;
    if (lower.length === 2 && /[a-z]/i.test(name)) return true;
  }
  return false;
}
