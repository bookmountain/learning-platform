import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkdownTable } from "../markdown-table.js";

test("parseMarkdownTable recognizes a standard pipe table", () => {
  const lines = [
    "| Power | Approximate value | Full name | Short name |",
    "| --- | --- | --- | --- |",
    "| 10 | 1 Thousand | 1 Kilobyte | 1 KB |",
    "| 20 | 1 Million | 1 Megabyte | 1 MB |",
    "",
    "Table 1",
  ];

  assert.deepEqual(parseMarkdownTable(lines, 0), {
    headers: ["Power", "Approximate value", "Full name", "Short name"],
    alignments: ["left", "left", "left", "left"],
    rows: [
      ["10", "1 Thousand", "1 Kilobyte", "1 KB"],
      ["20", "1 Million", "1 Megabyte", "1 MB"],
    ],
    nextIndex: 4,
  });
});

test("parseMarkdownTable handles escaped pipes, code spans, and alignment", () => {
  const lines = ["Name | Example | Count", ":--- | :---: | ---:", "Pipe | `a|b` | 2", "Escaped | a\\|b | 3"];
  const table = parseMarkdownTable(lines, 0);

  assert.deepEqual(table?.alignments, ["left", "center", "right"]);
  assert.deepEqual(table?.rows, [
    ["Pipe", "`a|b`", "2"],
    ["Escaped", "a|b", "3"],
  ]);
});

test("parseMarkdownTable leaves ordinary pipe-delimited prose alone", () => {
  assert.equal(parseMarkdownTable(["This | is prose", "and | so is this"], 0), null);
});
