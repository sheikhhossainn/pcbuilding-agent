#!/usr/bin/env python3
"""Tool to trim raw Ryans fixture HTML files into lightweight test fixtures (< 150 KB).

Extracts card nodes (div.category-single-product) and pagination (ul.pagination),
dropping heavy redundant subtrees (hidden inputs, mobile duplicate buttons, wishlist/compare buttons, short desc),
and writes committed test fixtures to scraper/tests/fixtures/ryans/.
"""

import os
import re
import sys
from pathlib import Path
from lxml import html

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "ryans"
RAW_DIR = BASE_DIR / "raw"

FIXTURE_FILES = [
    "cpu_page1.html",
    "keyboard_page1.html",
    "casing_page1.html",
    "ups_page2.html",
]

# Elements inside product cards that are not needed by the parser
STRIP_SELECTORS = [
    "input",
    ".grid-mobile-btn",
    ".card-buttons",
    ".short-desc-attr",
]


def trim_html(raw_html: str) -> str:
    """Trim raw HTML string down to product cards and pagination bar."""
    tree = html.fromstring(raw_html)
    cards = tree.cssselect("div.category-single-product")
    pagination = tree.cssselect("ul.pagination")

    for card in cards:
        for selector in STRIP_SELECTORS:
            for el in card.cssselect(selector):
                el.drop_tree()

    body_content = "".join(html.tostring(card, encoding="unicode") for card in cards)
    if pagination:
        body_content += html.tostring(pagination[0], encoding="unicode")

    out_html = f"<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Trimmed Fixture</title></head><body>{body_content}</body></html>"
    # Collapse multiple whitespace characters into single space
    out_html = re.sub(r"\s+", " ", out_html).strip()
    return out_html


def run_trim():
    if not RAW_DIR.exists():
        print(f"Error: Raw fixtures directory not found at {RAW_DIR}")
        return

    os.makedirs(BASE_DIR, exist_ok=True)
    print("Trimming Ryans raw fixtures...")

    for filename in FIXTURE_FILES:
        raw_path = RAW_DIR / filename
        if not raw_path.exists():
            print(f"Warning: {raw_path} does not exist, skipping.")
            continue

        with open(raw_path, "r", encoding="utf-8") as f:
            raw_content = f.read()

        trimmed = trim_html(raw_content)
        out_path = BASE_DIR / filename
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(trimmed)

        raw_size_kb = len(raw_content.encode("utf-8")) / 1024
        out_size_kb = len(trimmed.encode("utf-8")) / 1024
        print(f"  ✓ {filename}: {raw_size_kb:.1f} KB -> {out_size_kb:.1f} KB ({out_path})")

    print("Done trimming fixtures.")


if __name__ == "__main__":
    run_trim()
