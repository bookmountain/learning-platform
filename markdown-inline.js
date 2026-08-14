const escapedMarkdownPunctuation = /\\([\\`*{}\[\]()#+\-.!_|>])/g;
const protectedEscapePattern = /\uE000(\d+)\uE001/g;

export function inlineMarkdown(value) {
  const escapedCharacters = [];
  const protectedValue = String(value || "").replace(escapedMarkdownPunctuation, (_match, character) => {
    const index = escapedCharacters.push(character) - 1;
    return `\uE000${index}\uE001`;
  });

  const rendered = escapeHtml(protectedValue)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>`;
    });

  return rendered.replace(protectedEscapePattern, (_match, index) => escapeHtml(escapedCharacters[Number(index)] || ""));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
