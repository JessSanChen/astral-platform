/**
 * What makes an email address and a password acceptable at sign-up.
 *
 * One definition, used by the form for immediate feedback and by the server
 * for the decision, so the two cannot disagree. Nothing here touches the
 * database, which is what lets the browser import it.
 *
 * Both matter more here than usual, because there is no email on the day:
 * no confirmation message to bounce, and no "forgot password" link. An
 * address typed wrong is an account its owner cannot find again, and the
 * only way back into any account is an organizer setting a new password.
 */

// --- Email -----------------------------------------------------------------

/** Returns what is wrong with an address, or null if it will do. */
export function emailProblem(raw: string): string | null {
  const email = raw.trim();
  if (!email) return "Enter your email address.";
  if (email.length > 254 || /\s/.test(email)) return "That does not look like an email address.";
  const at = email.lastIndexOf("@");
  if (at < 1 || email.indexOf("@") !== at) return "That does not look like an email address.";
  const domain = email.slice(at + 1);
  // The browser's own check accepts "name@host". A real address has a dot
  // in what follows the @, and letters after the last one.
  if (
    !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain) ||
    !/\.[a-z]{2,}$/i.test(domain) ||
    email.includes("..")
  ) {
    return "Check the part after the @. It should look like example.com.";
  }
  return null;
}

/** Slips of the keyboard seen often enough to be worth asking about. */
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "googlemail.con": "googlemail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "icoud.com": "icloud.com",
  "iclod.com": "icloud.com",
};

const ENDING_TYPOS: [RegExp, string][] = [
  [/\.con$/, ".com"],
  [/\.cmo$/, ".com"],
  [/\.ocm$/, ".com"],
  [/\.comm$/, ".com"],
  [/\.ed$/, ".edu"],
  [/\.eud$/, ".edu"],
  [/\.edi$/, ".edu"],
  [/\.ogr$/, ".org"],
];

/**
 * A likely correction for an address that is valid but probably mistyped,
 * or null. Advice only: plenty of real domains look like typos of others.
 */
export function emailSuggestion(raw: string): string | null {
  const email = raw.trim();
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();

  let better = DOMAIN_TYPOS[domain];
  if (!better) {
    for (const [pattern, ending] of ENDING_TYPOS) {
      if (pattern.test(domain)) {
        better = domain.replace(pattern, ending);
        break;
      }
    }
  }
  return better && better !== domain ? `${local}@${better}` : null;
}

// --- Password --------------------------------------------------------------

/**
 * Passwords that are the first thing anyone tries. Short on purpose: the
 * rules below already reject most of the usual list for having no digit or
 * no letter, so this only needs the ones that would otherwise pass.
 */
const COMMON_PASSWORDS = new Set([
  "password1",
  "password12",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "qwerty123",
  "qwerty1234",
  "abc12345",
  "abcd1234",
  "1q2w3e4r",
  "1qaz2wsx",
  "a1b2c3d4",
  "letmein1",
  "letmein123",
  "welcome1",
  "welcome123",
  "iloveyou1",
  "monkey123",
  "dragon123",
  "football1",
  "baseball1",
  "sunshine1",
  "princess1",
  "admin123",
  "admin1234",
  "changeme1",
  "changeme123",
  "test1234",
  "testing123",
  "asdf1234",
  "zxcv1234",
  "trustno1",
]);

export type PasswordRule = { id: string; label: string; met: boolean };

/**
 * The rules a password is held to, each marked met or not, so a form can
 * show them as a checklist while someone types.
 *
 * Deliberately few. Length and not being guessable are what protect an
 * account; demanding symbols and mixed case mostly produces "Password1!".
 */
export function passwordRules(
  password: string,
  who: { name?: string; email?: string } = {},
): PasswordRule[] {
  const lower = password.toLowerCase();

  // Words an outsider could guess without knowing anything else: the
  // event's own name, and the person's name or address.
  const personal = [
    "astral",
    ...(who.name ?? "").toLowerCase().split(/\s+/),
    (who.email ?? "").toLowerCase().split("@")[0],
  ].filter((word) => word.length >= 4);
  const guessable =
    COMMON_PASSWORDS.has(lower) ||
    lower.includes("password") ||
    personal.some((word) => lower.includes(word)) ||
    /^(.)\1+$/.test(password);

  return [
    { id: "length", label: "At least 8 characters", met: password.length >= 8 },
    {
      id: "mix",
      label: "A letter and a number",
      met: /[a-z]/i.test(password) && /\d/.test(password),
    },
    {
      id: "guessable",
      label: "Not your name, your email, or an obvious word",
      met: password.length > 0 && !guessable,
    },
  ];
}

/** Returns what is wrong with a password, or null if it will do. */
export function passwordProblem(
  password: string,
  who: { name?: string; email?: string } = {},
): string | null {
  const unmet = passwordRules(password, who).find((rule) => !rule.met);
  if (!unmet) return null;
  switch (unmet.id) {
    case "length":
      return "Use a password of at least 8 characters.";
    case "mix":
      return "Use a password with at least one letter and one number.";
    default:
      return "That password is too easy to guess. Avoid your name, your email, and obvious words.";
  }
}
