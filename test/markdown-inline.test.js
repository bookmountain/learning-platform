import assert from "node:assert/strict";
import test from "node:test";

import { inlineMarkdown } from "../markdown-inline.js";

test("inlineMarkdown removes converter escapes from formulas and identifiers", () => {
  assert.equal(inlineMarkdown("300 million \\* 50% = 150 million"), "300 million * 50% = 150 million");
  assert.equal(inlineMarkdown("tweet\\_id 64 bytes"), "tweet_id 64 bytes");
  assert.equal(inlineMarkdown("30 TB \\* 365 \\* 5 = ~55 PB"), "30 TB * 365 * 5 = ~55 PB");
});

test("inlineMarkdown keeps escaped formatting characters literal", () => {
  assert.equal(inlineMarkdown("\\*not italic\\* and \\*\\*not bold\\*\\*"), "*not italic* and **not bold**");
  assert.equal(inlineMarkdown("**actually bold**"), "<strong>actually bold</strong>");
});

test("inlineMarkdown continues to escape unsafe HTML", () => {
  assert.equal(inlineMarkdown("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
});
