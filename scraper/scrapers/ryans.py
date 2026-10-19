import json
import re
from lxml import html

try:
    from scrapers._common import clean_price, strip_tracking
except ImportError:
    from _common import clean_price, strip_tracking

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
        # Find page=N in query parameters
        match = re.search(r'[?&]page=(\d+)', href)
        if match:
            nums.append(int(match.group(1)))
        else:
            # Check link text if purely numeric
            txt = (a.text_content() or "").strip()
            if txt.isdigit():
                nums.append(int(txt))

    return max(nums) if nums else 1
