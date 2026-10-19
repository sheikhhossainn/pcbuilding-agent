import json
import random
import re
import time
from lxml import html

try:
    from scrapers._common import strip_tracking
except ImportError:
    from _common import strip_tracking

# Ryans Computers category URLs (every value is a list of category endpoints)
URL_MAP = {
    "cpu":         ["https://www.ryans.com/category/desktop-component-processor"],
    "motherboard": ["https://www.ryans.com/category/desktop-component-motherboard"],
    "ram":         ["https://www.ryans.com/category/desktop-component-desktop-ram"],
    "gpu":         ["https://www.ryans.com/category/desktop-component-graphics-card"],
    "storage":     [
        "https://www.ryans.com/category/internal-ssd",
        "https://www.ryans.com/category/internal-hdd",
    ],
    "psu":         ["https://www.ryans.com/category/desktop-component-power-supply"],
    "casing":      ["https://www.ryans.com/category/desktop-component-casing"],
    "cpu-cooler":  ["https://www.ryans.com/category/desktop-component-cpu-cooler"],
    "monitor":     ["https://www.ryans.com/category/monitor-all-monitor"],
    "mouse":       ["https://www.ryans.com/category/desktop-component-mouse"],
    "keyboard":    ["https://www.ryans.com/category/desktop-component-keyboard"],
    "ups":         ["https://www.ryans.com/category/desktop-component-ups"],
}

_browser = None


def _get_browser():
    """Lazily instantiate and return the shared CloudflareBrowser instance for Ryans."""
    global _browser
    if _browser is None:
        try:
            from scrapers._cf_browser import CloudflareBrowser
        except ImportError:
            from _cf_browser import CloudflareBrowser
        _browser = CloudflareBrowser(site="ryans", port=9333)
    return _browser


def close():
    """Quit and reset the shared CloudflareBrowser instance."""
    global _browser
    if _browser is not None:
        try:
            _browser.close()
        except Exception:
            pass
        finally:
            _browser = None


def parse_listing(html_content: str) -> list[dict]:
    """Parse product cards from a Ryans listing page HTML string.
    
    Pure function: no navigation or browser access.
    Returns a list of dicts: {name, price, image, url, in_stock, status_code}.
    """
    if not html_content:
        return []

    try:
        tree = html.fromstring(html_content)
    except Exception:
        return []

    cards = tree.cssselect("div.category-single-product")
    products = []

    for card in cards:
        # 1. Product JSON metadata inside button[data-item]
        data = {}
        data_btn = card.cssselect("button[data-item]")
        if data_btn:
            raw_data = data_btn[0].attrib.get("data-item", "")
            if raw_data:
                try:
                    data = json.loads(raw_data)
                except Exception:
                    data = {}

        # 2. Product Name
        name = (data.get("product_name") or "").strip()
        if not name:
            link_el = card.cssselect(".product-title a, .image-box a")
            if link_el:
                name = link_el[0].text_content().strip()

        if not name:
            continue

        # 3. Product URL
        url = ""
        link_el = card.cssselect(".image-box a[href]")
        if not link_el:
            link_el = card.cssselect("a[href]")

        if link_el:
            href = (link_el[0].attrib.get("href") or "").strip()
            if href:
                if not href.startswith("http"):
                    href = f"https://www.ryans.com{href}" if href.startswith("/") else f"https://www.ryans.com/{href}"
                url = strip_tracking(href)

        # 4. Product Image
        image = ""
        img_el = card.cssselect(".image-box img")
        if img_el:
            src = (img_el[0].attrib.get("src") or
                   img_el[0].attrib.get("data-src") or "").strip()
            if src:
                if not src.startswith("http"):
                    src = f"https://www.ryans.com{src}" if src.startswith("/") else f"https://www.ryans.com/{src}"
                image = src

        # 5. Price & Stock Status
        # Selling price = product_price2 (matches the "Tk 4,900" shown).
        # in_stock = product_price2 > 0 AND the card contains an "Add to Cart" button.
        has_cart_button = any(
            "add to cart" in " ".join(el.text_content().lower().split())
            for el in card.cssselect("button, a")
        )

        raw_price2 = data.get("product_price2")
        p2 = None
        if raw_price2 is not None:
            try:
                val = int(float(raw_price2))
                if val > 0:
                    p2 = val
            except (ValueError, TypeError):
                p2 = None

        if p2 is not None and p2 > 0:
            price = p2
        else:
            price = None

        in_stock = bool(price is not None and price > 0 and has_cart_button)
        status_code = str(data.get("product_is_upcoming", ""))

        products.append({
            "name": name,
            "price": price,
            "image": image,
            "url": url,
            "in_stock": in_stock,
            "status_code": status_code,
        })

    return products


def last_page(html_content: str) -> int:
    """Extract the last page number from pagination links in ul.pagination.
    
    Pure function: returns max N among a[href*="?page="] or a[href*="&page="].
    Returns 1 if no pagination is present or no page numbers found.
    """
    if not html_content:
        return 1

    try:
        tree = html.fromstring(html_content)
    except Exception:
        return 1

    pag_container = tree.cssselect("ul.pagination")
    if not pag_container:
        return 1

    nums = []
    links = pag_container[0].cssselect("a[href]")
    for a in links:
        href = a.attrib.get("href", "")
        match = re.search(r'[?&]page=(\d+)', href)
        if match:
            nums.append(int(match.group(1)))
        else:
            txt = (a.text_content() or "").strip()
            if txt.isdigit():
                nums.append(int(txt))

    return max(nums) if nums else 1


PAGE_ATTEMPTS = 2
RETRY_DELAY_S = 5


def _load_page(browser, url: str, label: str) -> str:
    """Open a listing page and return its HTML, trying twice before giving up.

    Raises RuntimeError instead of skipping: a missing page would drop its products from the
    scrape, and sync_db would then mark them out of stock. On an error sync_db pauses at this
    category and leaves stock flags alone.
    """
    reason = ""
    for attempt in range(1, PAGE_ATTEMPTS + 1):
        try:
            if browser.open(url) and browser.is_cloudflare_cleared():
                return browser.page.html
            reason = f"challenge not cleared (title: '{browser.page.title if browser.page else ''}')"
        except Exception as e:
            reason = f"{type(e).__name__}: {e}"
        if attempt < PAGE_ATTEMPTS:
            print(f"{reason}, retrying...", end=" ", flush=True)
            time.sleep(RETRY_DELAY_S)
    raise RuntimeError(f"ryans {label} failed after {PAGE_ATTEMPTS} attempts: {reason}")


def scrape(category: str, price_min=None, price_max=None, sort_order=None) -> list[dict]:
    """Scrape product listings for a category from Ryans Computers.
    
    Walks all pages for each URL mapped to the category using ?limit=100.
    Stops a URL early when a page's products are all out of stock (since Ryans lists in-stock first).
    Applies client-side price bounds, de-duplicates by URL, and returns {name, price, image, url, in_stock}.
    Raises RuntimeError when a page can't be loaded, or when page 1 has no products, rather than
    returning a partial list.
    """
    if category not in URL_MAP:
        raise ValueError(f"Category '{category}' not mapped for ryans")

    browser = _get_browser()
    all_products = []
    seen_urls = set()

    for base_url in URL_MAP[category]:
        sep = "&" if "?" in base_url else "?"
        page_num = 1
        total_pages = 1

        while page_num <= total_pages:
            url = f"{base_url}{sep}limit=100" if page_num == 1 else f"{base_url}{sep}limit=100&page={page_num}"
            print(f"    Page {page_num}/{total_pages}...", end=" ", flush=True)

            page_html = _load_page(browser, url, f"{category} page {page_num} ({url})")
            if page_num == 1:
                total_pages = last_page(page_html)

            page_products = parse_listing(page_html)

            if not page_products:
                title = browser.page.title or ""
                # An empty first page means a wrong URL or changed markup, not an empty category.
                if page_num == 1:
                    raise RuntimeError(f"ryans {category}: 0 items on page 1 of {url} "
                                       f"(title: '{title}'), possible selector drift or wrong URL")
                print(f"0 items — possible selector drift (title: '{title}')")
            else:
                in_stock_count = sum(1 for p in page_products if p.get("in_stock"))
                print(f"{len(page_products)} items ({in_stock_count} in stock)")

            # De-duplicate across pages and URLs
            for p in page_products:
                p_url = p.get("url")
                if p_url and p_url not in seen_urls:
                    seen_urls.add(p_url)
                    all_products.append(p)

            # Early stop: Ryans lists in-stock items first. If all items on this page are out of stock,
            # stop pagination for this URL and return what we have so far.
            if page_products and all(not p.get("in_stock") for p in page_products):
                print(f"    stopped at page {page_num}/{total_pages} (rest out of stock)")
                break

            page_num += 1
            if page_num <= total_pages:
                time.sleep(random.uniform(1.5, 3.0))

    # Apply client-side price filters
    if price_min is not None:
        all_products = [p for p in all_products if p.get("price") is not None and p["price"] >= int(price_min)]
    if price_max is not None:
        all_products = [p for p in all_products if p.get("price") is not None and p["price"] <= int(price_max)]

    # Drop debugging status_code before returning to caller
    results = []
    for p in all_products:
        item = {
            "name": p["name"],
            "price": p["price"],
            "image": p["image"],
            "url": p["url"],
            "in_stock": p["in_stock"],
        }
        results.append(item)

    return results


if __name__ == "__main__":
    import sys
    cat = sys.argv[1] if len(sys.argv) > 1 else "cpu"
    print(f"\n--- Scraping Ryans: {cat} ---")

    try:
        b = _get_browser()
        for endpoint in URL_MAP.get(cat, []):
            test_url = f"{endpoint}?limit=100"
            b.open(test_url)
            lp = last_page(b.page.html) if b.page else 1
            print(f"Endpoint: {endpoint}")
            print(f"  Title: '{b.page.title if b.page else ''}'")
            print(f"  Detected last page: {lp}")

        results = scrape(cat)
        in_stock_total = sum(1 for p in results if p.get("in_stock"))
        print(f"\nResults for {cat}:")
        print(f"  Total items: {len(results)}")
        print(f"  In-stock items: {in_stock_total}")
        print(f"  Out-of-stock items: {len(results) - in_stock_total}")
        print(f"\nFirst 3 items:")
        for idx, p in enumerate(results[:3], start=1):
            print(f"  {idx}. {p['name']} | Tk {p['price']} | In-stock: {p['in_stock']}")
            print(f"     URL: {p['url']}")
    finally:
        close()
