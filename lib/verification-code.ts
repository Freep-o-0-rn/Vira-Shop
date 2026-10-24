/**
 * Accept copied one-time codes with spaces, non-breaking spaces, newlines
 * or punctuation. The input itself must NOT use maxLength={6}: browsers
 * truncate pasted text before React can remove separators.
 */
export function normalizeVerificationCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}
