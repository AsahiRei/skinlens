export function formatValue(val: string) {
  return val?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}