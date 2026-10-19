#!/usr/bin/env python3
"""Ryans Computers Discovery & Fixture Collection Tool.

Features:
- Opens ryans.com with CloudflareBrowser (dedicated port 9333, profile scraper/.profiles/ryans).
- Positions Chrome visibly on screen so Turnstile challenge can be solved by human if prompted.
- Validates every page navigation: skips saving and records to a failed list if Cloudflare is not cleared.
- Performs strict category resolution with exclusions and specificity ranking.
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
        "keywords": ["/category/monitor", "monitor"],
        "exclusions": ["arm", "stand", "mount", "bracket", "accessory", "accessories", "cable", "cleaner"],
    },
    "mouse": {
        "keywords": ["accessories-mouse", "/category/mouse", "mouse"],
        "exclusions": ["pad", "mat", "feet", "bungee", "keyboard", "combo"],
    },
    "keyboard": {
        "keywords": ["accessories-keyboard", "/category/keyboard", "keyboard"],
        "exclusions": ["mouse", "combo", "wrist", "cover", "switch", "keycap"],
    },
    "ups": {
        "keywords": ["/category/ups", "ups"],
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


def resolve_category_urls_strict(discovered_menu):
    """Resolve category URLs strictly according to rules:
    - Keep candidate URL if it appears among discovered links.
    - Otherwise match by slug with exclusions (avoid laptop, cooler for cpu, mounts for monitor).
    - Prefer the longest, most specific match.
    - Track source and print a structured table.
    """
    resolutions = {}

    for cat, candidate_url in CANDIDATE_CATEGORIES.items():
        candidate_clean = candidate_url.split("?")[0].rstrip("/").lower()

        # 1. Exact candidate match in discovered menu
        if candidate_clean in discovered_menu:
            resolutions[cat] = {
                "url": candidate_url,
                "source": "candidate (verified in menu)",
                "matched_text": discovered_menu[candidate_clean].get("text", "")
            }
            continue

        # 2. Strict slug matching against discovered URLs
        rules = CATEGORY_RULES.get(cat, {})
        keywords = rules.get("keywords", [])
        exclusions = rules.get("exclusions", [])

        valid_matches = []
        for norm_url, info in discovered_menu.items():
            slug = norm_url.lower()
            if any(excl in slug for excl in exclusions):
                continue
            matching_kw = [kw for kw in keywords if kw in slug]
            if matching_kw:
                # Specificity: max length of matching keyword + length of slug
                specificity = max(len(kw) for kw in matching_kw) + len(slug)
                valid_matches.append((specificity, len(slug), info["url"], info.get("text", "")))

        if valid_matches:
            valid_matches.sort(key=lambda x: (x[0], x[1]), reverse=True)
            best_match = valid_matches[0]
            resolutions[cat] = {
                "url": best_match[2],
                "source": "menu match",
                "matched_text": best_match[3]
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
                # Append to index.jsonl
                with open(XHR_DIR / "index.jsonl", "a", encoding="utf-8") as idx:
                    idx.write(json.dumps(entry) + "\n")
                print(f"    [XHR/Fetch] Captured product JSON -> xhr/{filename} ({entry['size']} bytes, status {status})")
    except Exception as e:
        print(f"    Note: Exception during network packet capture: {e}")


def run_probe():
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(XHR_DIR, exist_ok=True)

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

        # Bring window onto visible screen area so human can solve Turnstile if prompted
        try:
            browser.page.set.window.location(50, 50)
            browser.page.set.window.size(1280, 850)
            browser.page.set.window.normal()
            print("Chrome window positioned on screen (50, 50).")
        except Exception as e:
            print(f"Note: Could not set window position: {e}")

        # Start network listener for both XHR and Fetch
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
