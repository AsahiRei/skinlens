// Minimum age required by the Terms & Conditions.
export const MIN_AGE = 20;

/** Latest date of birth allowed: today minus MIN_AGE years. */
export function getMaxDob(): Date {
  const today = new Date();
  return new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
}

/** True when someone born on `dob` is at least MIN_AGE years old today. */
export function isOldEnough(dob: Date): boolean {
  return dob.getTime() <= getMaxDob().getTime();
}
