import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkdownImage } from "../markdown-image.js";

test("parseMarkdownImage accepts citations with nested brackets in alt text", () => {
  assert.deepEqual(parseMarkdownImage(["![Figure 17 (Source: [10])](images/figure-17.webp)"], 0), {
    alt: "Figure 17 (Source: [10])",
    target: "images/figure-17.webp",
    nextIndex: 1,
  });
});

test("parseMarkdownImage accepts a destination on the following line", () => {
  assert.deepEqual(parseMarkdownImage(["![Figure 17 (Source: [10])]", "(images/figure-17.webp)"], 0), {
    alt: "Figure 17 (Source: [10])",
    target: "images/figure-17.webp",
    nextIndex: 2,
  });
});

test("parseMarkdownImage removes line wrapping from embedded image data", () => {
  assert.deepEqual(parseMarkdownImage(["![Diagram](data:image/webp;base64,abc", "123==)"], 0), {
    alt: "Diagram",
    target: "data:image/webp;base64,abc123==",
    nextIndex: 2,
  });
});

test("parseMarkdownImage leaves ordinary Markdown untouched", () => {
  assert.equal(parseMarkdownImage(["A regular paragraph."], 0), null);
  assert.equal(parseMarkdownImage(["![An incomplete image]", "A regular paragraph."], 0), null);
});
