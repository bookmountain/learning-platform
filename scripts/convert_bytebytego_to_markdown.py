from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path

from bs4 import BeautifulSoup
from markitdown import MarkItDown


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "resources" / "tutorials" / "bytebytego-system-design-interview"
DEST = SOURCE / "markdown"


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    converter = MarkItDown(enable_plugins=False)

    html_files = sorted(
        (path for path in SOURCE.glob("*.html") if path.name.lower() != "index.html"),
        key=natural_key,
    )

    for html_file in html_files:
        title, article_html = extract_article(html_file)
        markdown = converter.convert_stream(
            BytesIO(article_html.encode("utf-8")),
            file_extension=".html",
            keep_data_uris=True,
        ).text_content

        markdown = clean_markdown(markdown, title)
        output_path = DEST / f"{html_file.stem}.md"
        output_path.write_text(markdown, encoding="utf-8")
        print(f"wrote {output_path.relative_to(ROOT)}")

    print(f"converted {len(html_files)} files")


def extract_article(html_file: Path) -> tuple[str, str]:
    soup = BeautifulSoup(html_file.read_text(encoding="utf-8", errors="ignore"), "html.parser")
    article = soup.select_one('article[class*="learnContent"]') or soup.find("article")
    if article is None:
        raise RuntimeError(f"No article element found in {html_file}")

    article = BeautifulSoup(str(article), "html.parser")

    for tag in article(["script", "style", "noscript", "button"]):
        tag.decompose()

    for img in list(article.find_all("img")):
        src = img.get("src", "")
        alt = (img.get("alt") or "").strip()
        if src.startswith("data:image/svg+xml") and not alt:
            img.decompose()

    h1 = article.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else title_from_filename(html_file)

    return title, f"<!doctype html><html><body>{article}</body></html>"


def clean_markdown(markdown: str, title: str) -> str:
    markdown = markdown.replace("\r\n", "\n").replace("\r", "\n")
    markdown = re.sub(r"^\s*\*\*\d{1,3}\*\*\s*\n+", "", markdown)
    markdown = re.sub(r"\n{3,}", "\n\n", markdown).strip()

    if not markdown.startswith("# "):
        markdown = f"# {title}\n\n{markdown}"

    return markdown + "\n"


def title_from_filename(path: Path) -> str:
    return re.sub(r"^\d+[.\s]+", "", path.stem).strip()


def natural_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", path.name)]


if __name__ == "__main__":
    main()
