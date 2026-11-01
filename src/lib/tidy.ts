/** Model prose is sometimes lowercase or unpunctuated; present it like a sentence. */
export function tidy(sentence: string): string {
  let t = sentence.trim().replace(/[ \t\r\n]+/g, " ");
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?…"”')]$/.test(t)) t += ".";
  return t;
}
