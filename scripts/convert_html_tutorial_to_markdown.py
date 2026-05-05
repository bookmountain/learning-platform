from __future__ import annotations

import argparse
import re
from io import BytesIO
from pathlib import Path

from bs4 import BeautifulSoup
from markitdown import MarkItDown


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    args = parse_args()
    source = args.source.resolve()
    destination = (args.destination or source / "markdown").resolve()

    destination.mkdir(parents=True, exist_ok=True)
    converter = MarkItDown(enable_plugins=False)

    html_files = sorted(
        (path for path in source.glob("*.html") if path.name.lower() != "index.html"),
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
        output_path = destination / f"{html_file.stem}.md"
        output_path.write_text(markdown, encoding="utf-8")
        print(f"wrote {output_path.relative_to(ROOT)}")

    print(f"converted {len(html_files)} files")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert a folder of HTML tutorial files to Markdown.")
    parser.add_argument("source", type=Path, help="Folder containing HTML files to convert.")
    parser.add_argument(
        "--destination",
        "-d",
        type=Path,
        default=None,
        help="Output folder. Defaults to a markdown/ folder inside the source folder.",
    )
    return parser.parse_args()


def extract_article(html_file: Path) -> tuple[str, str]:
    soup = BeautifulSoup(html_file.read_text(encoding="utf-8", errors="ignore"), "html.parser")
    article = soup.select_one('article[class*="learnContent"]') or soup.find("article") or soup.body
    if article is None:
        raise RuntimeError(f"No article content found in {html_file}")

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
    return re.sub(r"^\d+[.\s_-]+", "", path.stem).strip()


def natural_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", path.name)]


if __name__ == "__main__":
    main()
