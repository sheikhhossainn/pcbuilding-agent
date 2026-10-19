#!/usr/bin/env python3
"""Ryans Computers Discovery & Fixture Collection Tool.

Features:
- Opens ryans.com with CloudflareBrowser (dedicated port 9333, profile scraper/.profiles/ryans).
- Positions Chrome visibly on screen so Turnstile challenge can be solved by human if prompted.
- Validates every page navigation: skips saving and records to a failed list if Cloudflare is not cleared.
- Performs strict segment-based category resolution with brand exclusions and shortest-slug ranking.
- Saves raw probe fixtures under scraper/tests/fixtures/ryans/raw/ (home.html, page1/page2 per category).
- Captures XHR and Fetch JSON product responses to raw/xhr/<category>_<n>.json with index.jsonl.
- Examines pagination strictly within container selectors.
"""

import json
import os
import random
import sys
import time
from pathlib import Path

# Add scraper dir to sys.path
SCRAPER_DIR = Path(__file__).resolve().parent.parent
if str(SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPER_DIR))

try:
    from scrapers._cf_browser import CloudflareBrowser
except ImportError:
    from _cf_browser import CloudflareBrowser

FIXTURES_DIR = SCRAPER_DIR / "tests" / "fixtures" / "ryans"
RAW_DIR = FIXTURES_DIR / "raw"
XHR_DIR = RAW_DIR / "xhr"

CANDIDATE_CATEGORIES = {
    "cpu": "https://www.ryans.com/category/desktop-component-processor",
    "motherboard": "https://www.ryans.com/category/desktop-component-motherboard",
    "ram": "https://www.ryans.com/category/desktop-component-desktop-ram",
    "gpu": "https://www.ryans.com/category/desktop-component-graphics-card",
    "storage": "https://www.ryans.com/category/desktop-component-ssd",
    "storage-hdd": "https://www.ryans.com/category/desktop-component-hard-disk-drive",
    "psu": "https://www.ryans.com/category/desktop-component-power-supply",
    "casing": "https://www.ryans.com/category/desktop-component-casing",
    "cpu-cooler": "https://www.ryans.com/category/desktop-component-cpu-cooler",
    "monitor": "https://www.ryans.com/category/monitor",
    "mouse": "https://www.ryans.com/category/accessories-mouse",
    "keyboard": "https://www.ryans.com/category/accessories-keyboard",
    "ups": "https://www.ryans.com/category/ups",
}

BRAND_EXCLUSIONS = {
    "intel", "amd", "nvidia", "asus", "msi", "gigabyte", "asrock", "biostar",
    "colorful", "zotac", "pny", "sapphire", "corsair", "kingston", "gskill",
    "adata", "team", "lexar", "transcend", "samsung", "crucial", "western-digital",
    "seagate", "toshiba", "deepcool", "antec", "thermaltake", "cooler-master",
    "montech", "lian-li", "nzxt", "gamdias", "viewsonic", "benq", "dell", "hp",
    "acer", "lg", "lenovo", "philips", "logitech", "razer", "fantech", "a4tech"
}

CATEGORY_RULES = {
    "cpu": {
        "keywords": ["desktop-component-processor", "processor", "cpu"],
        "exclusions": ["cooler", "cooling", "fan", "laptop", "notebook", "portable", "external", "server", "thermal"],
    },
    "motherboard": {
        "keywords": ["desktop-component-motherboard", "motherboard"],
        "exclusions": ["laptop", "notebook", "server", "accessories"],
    },
    "ram": {
        "keywords": ["desktop-component-desktop-ram", "desktop-ram", "ram"],
        "exclusions": ["laptop", "notebook", "portable", "external", "server", "mac", "accessories"],
    },
    "gpu": {
        "keywords": ["desktop-component-graphics-card", "graphics-card", "gpu"],
        "exclusions": ["laptop", "external", "dock", "server", "accessories"],
    },
    "storage": {
        "keywords": ["desktop-component-ssd", "ssd", "solid-state-drive"],
        "exclusions": ["laptop", "notebook", "portable", "external", "server", "hdd", "hard-disk", "enclosure"],
    },
    "storage-hdd": {
        "keywords": ["desktop-component-hard-disk-drive", "hard-disk-drive", "hdd"],
        "exclusions": ["laptop", "notebook", "portable", "external", "server", "ssd", "enclosure"],
    },
    "psu": {
        "keywords": ["desktop-component-power-supply", "power-supply", "psu"],
        "exclusions": ["laptop", "adapter", "ups", "cable", "tester"],
    },
    "casing": {
        "keywords": ["desktop-component-casing", "casing"],
        "exclusions": ["cooler", "fan", "power", "accessory", "accessories", "bag", "cover"],
    },
    "cpu-cooler": {
        "keywords": ["desktop-component-cpu-cooler", "cpu-cooler", "cooler"],
        "exclusions": ["case-fan", "casing-fan", "laptop", "water-cooling-custom"],
    },
    "monitor": {
        "keywords": ["monitor"],
        "exclusions": ["arm", "stand", "mount", "bracket", "accessory", "accessories", "cable", "cleaner"],
    },
    "mouse": {
        "keywords": ["accessories-mouse", "mouse"],
        "exclusions": ["pad", "mat", "feet", "bungee", "keyboard", "combo"],
    },
    "keyboard": {
        "keywords": ["accessories-keyboard", "keyboard"],
        "exclusions": ["mouse", "combo", "wrist", "cover", "switch", "keycap"],
    },
    "ups": {
        "keywords": ["ups"],
        "exclusions": ["battery", "stabilizer", "surge"],
    },
}

PAGINATION_CONTAINER_SELECTORS = [
    "css:ul.pagination",
    "css:.pagination",
    "css:nav.pagination",
    "css:.category-pagination",
    "css:div.pagination-container",
    "css:[aria-label*='pagination' i]",
    "css:.pager",
]


def get_slug_segments(url_or_slug: str) -> tuple[str, list[str]]:
    """Extract slug and split into lowercase segment tokens by hyphen."""
    if not url_or_slug:
        return "", []
    path = url_or_slug.split("?")[0].split("#")[0].rstrip("/")
    slug = path.split("/")[-1].lower()
    segments = [s for s in slug.split("-") if s]
    return slug, segments


def has_consecutive_segments(segments: list[str], target_parts: list[str]) -> bool:
    """Check if target_parts appears as a consecutive sequence in segments."""
    if not target_parts or len(target_parts) > len(segments):
        return False
    n = len(target_parts)
    for i in range(len(segments) - n + 1):
        if segments[i:i + n] == target_parts:
            return True
    return False


def is_slug_excluded(segments: list[str], custom_exclusions: list[str], allowed_words: set[str] = None) -> bool:
    """Check if any custom exclusions or brand sub-categories match consecutive segments."""
    allowed = allowed_words or set()

    for excl in custom_exclusions:
        excl_parts = excl.lower().split("-")
        if has_consecutive_segments(segments, excl_parts):
            return True

    for brand in BRAND_EXCLUSIONS:
        brand_parts = brand.lower().split("-")
        if brand in allowed:
            continue
        if has_consecutive_segments(segments, brand_parts):
            return True

    return False


def match_slug_keyword_tier(segments: list[str], keywords: list[str], candidate_slug: str) -> tuple[int, str]:
    """Determine keyword match tier:
    - Tier 3: Full candidate slug match (e.g. desktop-component-processor)
    - Tier 2: Multi-word keyword match (e.g. graphics-card)
    - Tier 1: Single-word keyword match (e.g. processor)
    - Tier 0: No match
    Returns (tier, matching_keyword).
    """
    candidate_parts = candidate_slug.lower().split("-")
    if candidate_parts and has_consecutive_segments(segments, candidate_parts):
        return 3, candidate_slug

    best_tier = 0
    best_kw = ""
    for kw in keywords:
        kw_parts = kw.lower().split("-")
        if has_consecutive_segments(segments, kw_parts):
            tier = 2 if len(kw_parts) > 1 else 1
            if tier > best_tier:
                best_tier = tier
                best_kw = kw

    return best_tier, best_kw


def resolve_category_urls_strict(discovered_menu: dict[str, dict], candidates: dict[str, str] = None) -> dict[str, dict]:
    """Resolve category URLs strictly according to rules:
    - Keep candidate URL if it appears among discovered links.
    - Match keywords on whole slug segments (split on "-"), not raw substrings (avoids 'ram' matching 'frame').
    - Rank by (strongest keyword matched > shorter slug first).
    - Exclude brand sub-categories (intel, amd, etc.) unless keyword contains them.
    - Record source: 'candidate (verified in menu)', 'menu match', or 'candidate fallback'.
    """
    if candidates is None:
        candidates = CANDIDATE_CATEGORIES

    resolutions = {}

    for cat, candidate_url in candidates.items():
        candidate_slug, _ = get_slug_segments(candidate_url)
        candidate_clean = candidate_url.split("?")[0].rstrip("/").lower()

        # 1. Exact candidate match in discovered menu
        exact_match = None
        for disc_key, info in discovered_menu.items():
            if info["url"].split("?")[0].rstrip("/").lower() == candidate_clean:
                exact_match = info
                break

        if exact_match:
            resolutions[cat] = {
                "url": exact_match["url"],
                "source": "candidate (verified in menu)",
                "matched_text": exact_match.get("text", "")
            }
            continue

        # 2. Strict slug matching against discovered URLs
        rules = CATEGORY_RULES.get(cat, {})
        keywords = rules.get("keywords", [])
        exclusions = rules.get("exclusions", [])

        valid_matches = []
        for disc_key, info in discovered_menu.items():
            slug, segments = get_slug_segments(info["url"])
            if not segments:
                continue

            if is_slug_excluded(segments, exclusions):
                continue

            tier, matching_kw = match_slug_keyword_tier(segments, keywords, candidate_slug)
            if tier > 0:
                valid_matches.append({
                    "tier": tier,
                    "slug_len": len(slug),
                    "url": info["url"],
                    "text": info.get("text", ""),
                    "matching_kw": matching_kw
                })

        if valid_matches:
            # Sort: highest tier first, then shortest slug_len first
            valid_matches.sort(key=lambda x: (-x["tier"], x["slug_len"]))
            best = valid_matches[0]
            resolutions[cat] = {
                "url": best["url"],
                "source": "menu match",
                "matched_text": best["text"]
            }
        else:
            resolutions[cat] = {
                "url": candidate_url,
                "source": "candidate fallback",
                "matched_text": ""
            }

    return resolutions


def print_resolution_table(resolutions):
    """Print category resolution table to stdout and save to raw/category_resolution.txt."""
    lines = []
    header = f"{'Category':<14} | {'Source':<30} | {'Resolved URL'}"
    separator = "-" * 14 + "-+-" + "-" * 30 + "-+-" + "-" * 60
    lines.append(header)
    lines.append(separator)
    for cat, info in resolutions.items():
        lines.append(f"{cat:<14} | {info['source']:<30} | {info['url']}")

    table_text = "\n".join(lines)
    print("\n" + table_text + "\n")

    with open(RAW_DIR / "category_resolution.txt", "w", encoding="utf-8") as f:
        f.write(table_text + "\n")


def is_challenge_active(browser):
    """Check if the browser title still indicates an unsolved Cloudflare/Turnstile challenge."""
    title = (browser.page.title or "").strip().lower()
    if not title:
        return True
    indicators = [
        "just a moment",
        "performing security verification",
        "security verification",
        "attention required",
        "challenge",
    ]
    return any(ind in title for ind in indicators)


def extract_menu_links(browser):
    """Scan all navigation and anchor links on the homepage for category paths."""
    print("Scanning homepage menu links...")
    discovered = {}
    try:
        links = browser.page.eles("css:a")
        for a in links:
            href = (a.attr("href") or "").strip()
            text = (a.text or "").strip()
            if not href or href.startswith("javascript:") or href.startswith("#"):
                continue
            if "ryans.com" not in href and not href.startswith("/"):
                continue

            full_url = href if href.startswith("http") else f"https://www.ryans.com{href}"
            slug = full_url.lower()

            if "/category/" in slug:
                clean_key = full_url.split("?")[0].rstrip("/").lower()
                discovered[clean_key] = {
                    "text": text,
                    "url": full_url
                }
    except Exception as e:
        print(f"Warning scanning menu links: {e}")

    return discovered


def find_page_2_url(browser, base_url):
    """Find page 2 link inside pagination container; never take global links with text '2'."""
    page = browser.page
    pagination_container = None
    container_selector_found = None

    for selector in PAGINATION_CONTAINER_SELECTORS:
        try:
            container = page.ele(selector)
            if container:
                pagination_container = container
                container_selector_found = selector
                break
        except Exception:
            continue

    if pagination_container:
        try:
            links = pagination_container.eles("css:a")
            for a in links:
                href = (a.attr("href") or "").strip()
                if not href or href.startswith("javascript"):
                    continue
                full_href = href if href.startswith("http") else f"https://www.ryans.com{href}"
                if "page=2" in full_href or "/page/2" in full_href or "p=2" in full_href:
                    print(f"    Found page 2 link in container ({container_selector_found}): {full_href}")
                    return full_href

            for a in links:
                data_page = a.attr("data-page") or a.attr("data-page-no") or ""
                if data_page == "2":
                    href = (a.attr("href") or "").strip()
                    if href and not href.startswith("javascript"):
                        full_href = href if href.startswith("http") else f"https://www.ryans.com{href}"
                        print(f"    Found page 2 link via data-page in container ({container_selector_found}): {full_href}")
                        return full_href
        except Exception as e:
            print(f"    Warning reading pagination container: {e}")

    separator = "&" if "?" in base_url else "?"
    fallback_url = f"{base_url}{separator}page=2"
    print(f"    No page 2 link found inside pagination container — using fallback {fallback_url}")
    return fallback_url


def harvest_xhr(browser, category, xhr_summary, counter):
    """Capture JSON responses from XHR/Fetch network traffic matching product listings."""
    try:
        for packet in browser.page.listen.steps(timeout=1):
            url = getattr(packet, "url", "")
            method = getattr(packet, "method", "")
            status = getattr(packet.response, "status", None) if packet.response else None
            headers = getattr(packet.response, "headers", {}) if packet.response else {}
            content_type = ""
            if headers:
                for k, v in headers.items():
                    if k.lower() == "content-type":
                        content_type = str(v).lower()
                        break

            if "json" not in content_type:
                continue

            body = getattr(packet.response, "body", "")
            if not body:
                continue

            body_str = json.dumps(body) if isinstance(body, (dict, list)) else str(body)

            url_lower = url.lower()
            body_sample = body_str[:1000].lower()
            listing_indicators = ["product", "item", "price", "category", "catalog", "model", "stock"]
            is_listing = any(ind in url_lower for ind in listing_indicators) or any(ind in body_sample for ind in listing_indicators)

            if is_listing:
                counter[0] += 1
                n = counter[0]
                filename = f"{category}_{n}.json"
                file_path = XHR_DIR / filename
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(body_str)

                entry = {
                    "file": filename,
                    "category": category,
                    "url": url,
                    "method": method,
                    "status": status,
                    "size": len(body_str)
                }
                xhr_summary.append(entry)
                with open(XHR_DIR / "index.jsonl", "a", encoding="utf-8") as idx:
                    idx.write(json.dumps(entry) + "\n")
                print(f"    [XHR/Fetch] Captured product JSON -> xhr/{filename} ({entry['size']} bytes, status {status})")
    except Exception as e:
        print(f"    Note: Exception during network packet capture: {e}")


def run_probe():
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(XHR_DIR, exist_ok=True)

    # Truncate index.jsonl at the start of each run (Requirement 3)
    index_file = XHR_DIR / "index.jsonl"
    with open(index_file, "w", encoding="utf-8") as f:
        pass

    print("=" * 70)
    print("Starting Ryans Computers Discovery Probe")
    print("Port: 9333 | Profile: scraper/.profiles/ryans")
    print(f"Raw fixtures destination: {RAW_DIR}")
    print("=" * 70)

    browser = CloudflareBrowser(site="ryans", port=9333)
    failed_pages = []
    xhr_summary = []
    xhr_counter = [0]

    try:
        browser.launch()

        try:
            browser.page.set.window.location(50, 50)
            browser.page.set.window.size(1280, 850)
            browser.page.set.window.normal()
            print("Chrome window positioned on screen (50, 50).")
        except Exception as e:
            print(f"Note: Could not set window position: {e}")

        try:
            browser.page.listen.start(res_type=("XHR", "Fetch"))
            print("Network listener started for (XHR, Fetch) traffic.")
        except Exception as e:
            print(f"Note: Network listener could not start: {e}")

        # 1. Open homepage and wait for Cloudflare
        print("\nNavigating to https://www.ryans.com/ ...")
        success = browser.open("https://www.ryans.com/", timeout=300)
        if not success or is_challenge_active(browser):
            print("ERROR: Cloudflare challenge did not clear on homepage. Exiting.")
            failed_pages.append(("home", "page 1", "https://www.ryans.com/", browser.page.title))
            return

        print(f"Homepage loaded! Page title: '{browser.page.title}'")
        home_html = browser.page.html
        with open(RAW_DIR / "home.html", "w", encoding="utf-8") as f:
            f.write(home_html)
        print(f"✓ Saved homepage HTML ({len(home_html)} bytes) -> raw/home.html")
        time.sleep(2)

        # Harvest any XHR/Fetch triggered on homepage (Requirement 4)
        harvest_xhr(browser, "home", xhr_summary, xhr_counter)

        # 2. Extract and resolve category links strictly
        discovered_menu = extract_menu_links(browser)
        with open(RAW_DIR / "menu_links_discovered.json", "w", encoding="utf-8") as f:
            json.dump(discovered_menu, f, indent=2)
        print(f"Discovered {len(discovered_menu)} category links in menu.")

        resolutions = resolve_category_urls_strict(discovered_menu)
        print_resolution_table(resolutions)

        # 3. Probe each category and save page 1 & page 2 HTML
        print("=" * 70)
        print("Fetching Page 1 and Page 2 HTML for all categories...")
        print("=" * 70)

        for cat, info in resolutions.items():
            url = info["url"]
            print(f"\n[{cat.upper()}] Loading page 1: {url}")
            success = browser.open(url, timeout=60)
            if not success or is_challenge_active(browser):
                print(f"  [FAILED] Cloudflare verification did not clear for {cat} page 1. Skipping.")
                failed_pages.append((cat, "page 1", url, browser.page.title))
                continue

            time.sleep(random.uniform(1.5, 2.5))
            harvest_xhr(browser, cat, xhr_summary, xhr_counter)

            p1_html = browser.page.html
            p1_file = RAW_DIR / f"{cat}_page1.html"
            with open(p1_file, "w", encoding="utf-8") as f:
                f.write(p1_html)
            print(f"  ✓ Saved page 1 HTML ({len(p1_html)} bytes) -> raw/{p1_file.name}")

            # Find page 2 link inside pagination container
            page2_url = find_page_2_url(browser, url)
            print(f"  Loading page 2: {page2_url}")
            time.sleep(random.uniform(1.5, 3.0))

            success = browser.open(page2_url, timeout=60)
            if not success or is_challenge_active(browser):
                print(f"  [FAILED] Cloudflare verification did not clear for {cat} page 2. Skipping.")
                failed_pages.append((cat, "page 2", page2_url, browser.page.title))
                continue

            time.sleep(random.uniform(1.5, 2.5))
            harvest_xhr(browser, cat, xhr_summary, xhr_counter)

            p2_html = browser.page.html
            p2_file = RAW_DIR / f"{cat}_page2.html"
            with open(p2_file, "w", encoding="utf-8") as f:
                f.write(p2_html)
            print(f"  ✓ Saved page 2 HTML ({len(p2_html)} bytes) -> raw/{p2_file.name}")

            time.sleep(random.uniform(1.5, 2.5))

        print("\n" + "=" * 70)
        print("Probe Execution Finished")
        print("=" * 70)
        print(f"Total XHR/Fetch product listings captured: {len(xhr_summary)}")
        if xhr_summary:
            print(f"XHR index written to: raw/xhr/index.jsonl")

        if failed_pages:
            print(f"\n⚠️  FAILED PAGES ({len(failed_pages)} total):")
            for cat, page_label, failed_url, title in failed_pages:
                print(f"  - [{cat}] {page_label}: {failed_url} (Title: '{title}')")
        else:
            print("\n✓ All probed pages cleared Cloudflare and saved successfully.")

    finally:
        browser.close()


if __name__ == "__main__":
    run_probe()
