export function formatter(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}
/** Capitalize each word of a person's name for display ("laurence dela cruz" → "Laurence Dela Cruz"). */
export function displayName(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}
