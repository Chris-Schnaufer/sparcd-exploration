// PR #500 writes a delimited "collected YYYY-MM-DD" comment segment.
// Legacy/unrecognized prose is not a reliable source for a collection date.
export function extractCollectedDate(description: string): string | null {
  const match = description.match(/(?:^|\s+-\s+)collected\s+(\d{4}-\d{2}-\d{2})(?=\s+-\s+|\s*$)/i);
  if (!match) return null;
  const value = match[1];
  const parsed = new Date(`${value}T00:00:00.000Z`);
  // Date.parse accepts overflow days (February 30 becomes March 1).
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}
