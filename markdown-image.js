export function parseMarkdownImage(lines, startIndex) {
  const firstLine = String(lines[startIndex] ?? "");
  if (!firstLine.trimStart().startsWith("![")) return null;

  let candidate = firstLine.trim();

  for (let endIndex = startIndex; endIndex < lines.length; endIndex += 1) {
    if (endIndex > startIndex) {
      const nextLine = String(lines[endIndex] ?? "");
      if (!nextLine.trim()) return null;
      candidate += `\n${nextLine.trim()}`;
    }

    const match = candidate.match(/^!\[([\s\S]*)\]\s*\(([\s\S]+)\)$/);
    if (!match) continue;

    const alt = match[1].replace(/\s*\n\s*/g, " ").trim();
    const rawTarget = match[2].trim();
    const target = /^data:image\//i.test(rawTarget) ? rawTarget.replace(/\s+/g, "") : rawTarget;

    return { alt, target, nextIndex: endIndex + 1 };
  }

  return null;
}
