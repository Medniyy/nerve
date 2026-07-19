/**
 * Map a team/country name to a flag-icons ISO code.
 * Covers World Cup nations + the demo teams. Returns null when unknown
 * so the UI can fall back to a plain badge.
 */

const NAME_TO_CODE: Record<string, string> = {
  argentina: "ar",
  brazil: "br",
  france: "fr",
  england: "gb-eng",
  scotland: "gb-sct",
  wales: "gb-wls",
  spain: "es",
  germany: "de",
  portugal: "pt",
  netherlands: "nl",
  holland: "nl",
  italy: "it",
  belgium: "be",
  croatia: "hr",
  morocco: "ma",
  japan: "jp",
  "south korea": "kr",
  korea: "kr",
  "united states": "us",
  usa: "us",
  mexico: "mx",
  uruguay: "uy",
  colombia: "co",
  ecuador: "ec",
  senegal: "sn",
  ghana: "gh",
  nigeria: "ng",
  cameroon: "cm",
  switzerland: "ch",
  denmark: "dk",
  sweden: "se",
  norway: "no",
  poland: "pl",
  serbia: "rs",
  "saudi arabia": "sa",
  qatar: "qa",
  australia: "au",
  canada: "ca",
  tunisia: "tn",
  "costa rica": "cr",
  iran: "ir",
  "ivory coast": "ci",
  "cote d'ivoire": "ci",
  algeria: "dz",
  egypt: "eg",
  peru: "pe",
  chile: "cl",
  austria: "at",
  turkey: "tr",
  ukraine: "ua",
  greece: "gr",
  ireland: "ie",
};

/** flag-icons code (e.g. "br", "gb-eng") or null when we have no flag. */
export function teamFlagCode(name: string | undefined | null): string | null {
  if (!name) return null;
  return NAME_TO_CODE[name.trim().toLowerCase()] ?? null;
}

/** Short 3-letter badge fallback when no flag is available. */
export function teamBadge(name: string | undefined | null): string {
  if (!name) return "?";
  return name.trim().slice(0, 3).toUpperCase();
}
