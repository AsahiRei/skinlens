import profileOptions from "@/data/profile-options.json";

// Minimum age required by the Terms & Conditions.
export const MIN_AGE = 20;

const MONTHS: string[] = profileOptions.months;

/** Latest date of birth allowed: today minus MIN_AGE years. */
export function getMaxDob(): Date {
  const today = new Date();
  return new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
}

/** True when someone born on `dob` is at least MIN_AGE years old today. */
export function isOldEnough(dob: Date): boolean {
  return dob.getTime() <= getMaxDob().getTime();
}

/** "January 5, 2000" — the format the `age` column stores the date of birth in. */
export function formatDob(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** Parses the stored "January 5, 2000" string back into a Date (null when malformed). */
export function parseDob(value?: string | null): Date | null {
  if (!value) return null;
  const m = value.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 0 || Number.isNaN(day) || Number.isNaN(year)) return null;
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day)
    return null;
  return date;
}

/** Whole years between `dob` and `today`. */
export function ageFromDob(dob: Date, today: Date = new Date()): number {
  let age = today.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * The `age` column holds a date of birth, not a number. Converts it to years for anything that
 * says "you are N years old" (chatbot). Null when the stored value can't be parsed.
 */
export function ageFromStoredDob(value?: string | null): number | null {
  const dob = parseDob(value);
  return dob ? ageFromDob(dob) : null;
}
