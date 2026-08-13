function splitTableRow(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.includes("|")) return [];

  const cells = [];
  let cell = "";
  let escaped = false;
  let inCode = false;

  for (const character of trimmed) {
    if (escaped) {
      cell += character === "|" ? "|" : `\\${character}`;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "`") {
      inCode = !inCode;
      cell += character;
      continue;
    }
    if (character === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += character;
  }
  if (escaped) cell += "\\";
  cells.push(cell.trim());

  if (trimmed.startsWith("|")) cells.shift();
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) cells.pop();
  return cells;
}

function parseAlignment(cell) {
  const marker = cell.trim();
  if (!/^:?-{3,}:?$/.test(marker)) return null;
  if (marker.startsWith(":") && marker.endsWith(":")) return "center";
  if (marker.endsWith(":")) return "right";
  return "left";
}

export function parseMarkdownTable(lines, startIndex) {
  const headers = splitTableRow(lines[startIndex]);
  const delimiterCells = splitTableRow(lines[startIndex + 1]);
  if (!headers.length || delimiterCells.length !== headers.length) return null;

  const alignments = delimiterCells.map(parseAlignment);
  if (alignments.some((alignment) => alignment === null)) return null;

  const rows = [];
  let nextIndex = startIndex + 2;
  while (nextIndex < lines.length && lines[nextIndex].trim() && lines[nextIndex].includes("|")) {
    const cells = splitTableRow(lines[nextIndex]);
    if (!cells.length) break;
    rows.push(headers.map((_header, index) => cells[index] ?? ""));
    nextIndex += 1;
  }

  return { headers, alignments, rows, nextIndex };
}
