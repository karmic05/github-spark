// Fast unit checks (no browser): node --experimental-strip-types scripts/unit.mjs
import { tidy } from "../src/lib/tidy.ts";

let failed = 0;
function eq(name, got, want) {
  if (got !== want) {
    failed++;
    console.log(`FAIL  ${name}\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`);
  } else {
    console.log(`PASS  ${name}`);
  }
}

// Regression: every letter must survive (a bad regex once stripped every "s").
eq(
  "tidy keeps every letter and capitalises + punctuates",
  tidy("you carried the weight of the finish line, and in the release, your sister’s kindness made something tender"),
  "You carried the weight of the finish line, and in the release, your sister’s kindness made something tender.",
);
eq("tidy collapses runs of whitespace", tidy("  Already   fine.  "), "Already fine.");
eq("tidy turns newlines and tabs into spaces", tidy("Mixed\ncase  with\ttabs!"), "Mixed case with tabs!");
eq("tidy leaves existing punctuation alone", tidy('She said "yes"'), 'She said "yes"');
eq("tidy handles empty input", tidy(""), "");
const everyLetter = "the quick brown fox jumps over the lazy dog sessions";
eq("tidy preserves all letters of a pangram", tidy(everyLetter).toLowerCase().replace(/\.$/, ""), everyLetter);

console.log(failed ? `\n${failed} failed` : "\nall unit checks passed");
process.exit(failed ? 1 : 0);
