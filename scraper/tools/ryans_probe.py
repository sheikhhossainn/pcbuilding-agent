#!/usr/bin/env python3
"""Ryans Computers Discovery & Fixture Collection Tool.

Opens ryans.com with CloudflareBrowser (port 9333, profile scraper/.profiles/ryans),
brings the Chrome window on-screen so Turnstile challenge can be solved by a human if prompted,
collects category menu links from the site, saves page 1 and page 2 HTML for each of the 12
categories to scraper/tests/fixtures/ryans/, and captures any JSON/XHR product listings.
"""

import json
import os
import random
import re
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

# Initial candidate category URLs (will be validated/updated by probing homepage menus)
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
                discovered[slug] = {
                    "text": text,
                    "url": full_url
                }
    except Exception as e:
        print(f"Warning scanning menu links: {e}")

    return discovered


def resolve_category_urls(discovered_menu):
    """Match discovered menu URLs against target categories or fallback to candidates."""
    resolved = dict(CANDIDATE_CATEGORIES)

    # Keywords to match discovered URLs to target categories
    category_matchers = {
        "cpu": ["processor", "desktop-component-processor", "cpu"],
        "motherboard": ["motherboard", "desktop-component-motherboard"],
        "ram": ["desktop-ram", "desktop-component-desktop-ram", "ram"],
        "gpu": ["graphics-card", "desktop-component-graphics-card", "gpu"],
        "storage": ["ssd", "solid-state-drive", "desktop-component-ssd"],
        "storage-hdd": ["hard-disk-drive", "desktop-component-hard-disk-drive", "hdd"],
        "psu": ["power-supply", "desktop-component-power-supply", "psu"],
        "casing": ["casing", "desktop-component-casing"],
        "cpu-cooler": ["cpu-cooler", "desktop-component-cpu-cooler"],
        "monitor": ["/category/monitor"],
        "mouse": ["accessories-mouse", "/category/mouse"],
        "keyboard": ["accessories-keyboard", "/category/keyboard"],
        "ups": ["/category/ups"],
    }

    for cat, patterns in category_matchers.items():
        for url_key, info in discovered_menu.items():
            if any(p in url_key for p in patterns):
                # Prefer exact match
                resolved[cat] = info["url"]
                break

    return resolved


def find_page_2_url(browser, base_url):
    """Inspect page 1 pagination to extract page 2 URL, or fall back to ?page=2."""
    try:
        # Look for pagination links containing 2
        for link in browser.page.eles("css:a"):
            text = (link.text or "").strip()
            href = (link.attr("href") or "").strip()
            if text == "2" and href:
                return href if href.startswith("http") else f"https://www.ryans.com{href}"
            if "page=2" in href or "/page/2" in href:
                return href if href.startswith("http") else f"https://www.ryans.com{href}"
    except Exception:
        pass

    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}page=2"


def run_probe():
    os.makedirs(FIXTURES_DIR, exist_ok=True)
    print("=" * 60)
    print("Starting Ryans Computers Discovery Probe")
    print("Port: 9333 | Profile: scraper/.profiles/ryans")
    print(f"Fixtures destination: {FIXTURES_DIR}")
    print("=" * 60)

    browser = CloudflareBrowser(site="ryans", port=9333)

    captured_xhr = []

    try:
        # Launch browser
        browser.launch()

        # Bring window onto visible screen area so human can solve Turnstile if prompted
        try:
            browser.page.set.window.location(50, 50)
            browser.page.set.window.size(1280, 850)
            browser.page.set.window.normal()
            print("Chrome window positioned on screen (50, 50).")
        except Exception as e:
            print(f"Note: Could not set window position: {e}")

        # Start network listener to observe XHR / JSON requests
        try:
            browser.page.listen.start(res_type="xhr")
            print("Network listener started for XHR traffic.")
        except Exception as e:
            print(f"Note: Network listener could not start: {e}")

        # 1. Open homepage and wait for Cloudflare
        print("\nNavigating to https://www.ryans.com/ ...")
        success = browser.open("https://www.ryans.com/", timeout=300)
        if not success:
            print("Error: Cloudflare verification did not clear within timeout.")
            return

        print(f"Homepage loaded! Page title: {browser.page.title}")
        time.sleep(2)

        # 2. Extract and resolve category links
        discovered_menu = extract_menu_links(browser)
        with open(FIXTURES_DIR / "menu_links_discovered.json", "w", encoding="utf-8") as f:
            json.dump(discovered_menu, f, indent=2)
        print(f"Discovered {len(discovered_menu)} category links in menu. Saved to menu_links_discovered.json")

        category_urls = resolve_category_urls(discovered_menu)
        with open(FIXTURES_DIR / "resolved_category_urls.json", "w", encoding="utf-8") as f:
            json.dump(category_urls, f, indent=2)
        print("Resolved target category URLs:")
        for cat, u in category_urls.items():
            print(f"  - {cat:12s}: {u}")

        # 3. Probe each category and save page 1 & page 2 HTML
        print("\n" + "=" * 60)
        print("Fetching Page 1 and Page 2 HTML for all categories...")
        print("=" * 60)

        for cat, url in category_urls.items():
            print(f"\n[{cat.upper()}] Loading page 1: {url}")
            browser.open(url)
            time.sleep(random.uniform(1.5, 2.5))

            # Collect any caught network packets
            try:
                for packet in browser.page.listen.steps(timeout=1):
                    p_url = getattr(packet, "url", "")
                    body = getattr(packet.response, "body", "")
                    if ("product" in p_url.lower() or "category" in p_url.lower() or "api" in p_url.lower()) and body:
                        captured_xhr.append({
                            "category": cat,
                            "url": p_url,
                            "body_sample": str(body)[:500]
                        })
            except Exception:
                pass

            p1_html = browser.page.html
            p1_file = FIXTURES_DIR / f"{cat}_page1.html"
            with open(p1_file, "w", encoding="utf-8") as f:
                f.write(p1_html)
            print(f"  ✓ Saved page 1 HTML ({len(p1_html)} bytes) -> {p1_file.name}")

            # Check page 2
            page2_url = find_page_2_url(browser, url)
            print(f"  Loading page 2: {page2_url}")
            time.sleep(random.uniform(1.5, 3.0))
            browser.open(page2_url)
            time.sleep(random.uniform(1.5, 2.5))

            try:
                for packet in browser.page.listen.steps(timeout=1):
                    p_url = getattr(packet, "url", "")
                    body = getattr(packet.response, "body", "")
                    if ("product" in p_url.lower() or "category" in p_url.lower() or "api" in p_url.lower()) and body:
                        captured_xhr.append({
                            "category": cat,
                            "url": p_url,
                            "body_sample": str(body)[:500]
                        })
            except Exception:
                pass

            p2_html = browser.page.html
            p2_file = FIXTURES_DIR / f"{cat}_page2.html"
            with open(p2_file, "w", encoding="utf-8") as f:
                f.write(p2_html)
            print(f"  ✓ Saved page 2 HTML ({len(p2_html)} bytes) -> {p2_file.name}")

            time.sleep(random.uniform(1.5, 2.5))

        # Save any captured XHR requests
        xhr_file = FIXTURES_DIR / "xhr_requests.json"
        with open(xhr_file, "w", encoding="utf-8") as f:
            json.dump(captured_xhr, f, indent=2)
        print(f"\nCaptured {len(captured_xhr)} relevant XHR/API requests -> {xhr_file.name}")

        print("\n" + "=" * 60)
        print("Ryans Probe Complete!")
        print(f"All fixtures saved in: {FIXTURES_DIR}")
        print("=" * 60)

    finally:
        browser.close()


if __name__ == "__main__":
    run_probe()
