from scrapling import Fetcher
from urllib.parse import urlencode, urlparse, parse_qsl, urlunparse
import re

URL_MAP = {
    "cpu": "https://www.techlandbd.com/pc-components/processor",
    "motherboard": "https://www.techlandbd.com/pc-components/motherboard",
    "ram": "https://www.techlandbd.com/pc-components/shop-desktop-ram",
    "gpu": "https://www.techlandbd.com/pc-components/graphics-card",
    "storage": "https://www.techlandbd.com/pc-components/solid-state-drive",
    "psu": "https://www.techlandbd.com/pc-components/power-supply",
    "casing": "https://www.techlandbd.com/pc-components/computer-case",
    "cpu-cooler": "https://www.techlandbd.com/pc-components/cpu-cooler",
    "monitor": "https://www.techlandbd.com/monitor-and-display",
    "mouse": "https://www.techlandbd.com/accessories/shop-computer-mouse",
    "keyboard": "https://www.techlandbd.com/accessories/computer-keyboard",
    "ups": "https://www.techlandbd.com/ups"
}

def clean_price(price_str):
    if not price_str:
        return None
    digits = re.sub(r'[^\d]', '', price_str)
    if not digits:
        return None
    return int(digits)

def get_first(element, selector):
    res = element.css(selector)
    return res[0] if res else None

MAX_PAGES = 10  # Increased from 3 because server-side price filtering doesn't work, we need more coverage

# TechLand supports server-side sorting via query params (sort/order). When the backend requests
# sorted results (price_asc/price_desc), the most relevant candidates (cheapest/best) should
# appear in the first page(s). To reduce scraping load and latency, we stop early once we have
# enough priced, in-stock items.
FAST_STOP_MIN_ITEMS = 30

def build_url(base_url, params):
    url_parts = list(urlparse(base_url))
    query = dict(parse_qsl(url_parts[4]))
    query.update({k: v for k, v in params.items() if v is not None})
    url_parts[4] = urlencode(query)
    return urlunparse(url_parts)

def scrape_page(page, products):
    name_elements = page.css("h4 a")

    for name_elem in name_elements:
        name = name_elem.text.strip()
        if not name:
            continue

        product_url = name_elem.attrib.get("href", "")

        # Traverse: a -> h4 -> parent div -> grandparent article (product card)
        h4 = name_elem.parent
        parent = h4.parent if h4 else None
        grandparent = parent.parent if parent else None
        
        # Image lives in the article (grandparent), not the inner div
        image = ""
        card = grandparent or parent
        if card:
            img_elem = get_first(card, "img")
            if img_elem:
                image = (img_elem.attrib.get("src") or 
                         img_elem.attrib.get("data-src") or 
                         img_elem.attrib.get("data-lazy-src") or "")

        # Price
        # TechLand cards often render a bold current price and (optionally) a struck-through old price.
        # Some cards also show an ultra-low bold value (e.g., "৳ 199") that appears to be an EMI/metadata
        # number rather than the real product price. We guard against that by preferring the old price
        # when the bold value is implausibly small relative to it.
        price = None
        price_container = card or parent
        if price_container:
            candidates = []
            bold_text = ""
            old_text = ""
            for span in price_container.css("span"):
                t = ((span.text or "").strip())
                tl = t.lower()
                if not t:
                    continue
                if "৳" not in t or not any(c.isdigit() for c in t):
                    continue
                if "save" in tl or "/mo" in tl:
                    continue

                candidates.append(t)
                cls = (span.attrib.get("class") or "").lower()
                if not old_text and "line-through" in cls:
                    old_text = t
                # Prefer the bold (non line-through) price as the primary candidate
                if not bold_text and ("font-bold" in cls) and ("line-through" not in cls):
                    bold_text = t

            primary_text = bold_text or (candidates[0] if candidates else "")
            primary_price = clean_price(primary_text)
            old_price = clean_price(old_text)

            if primary_price is not None and old_price is not None:
                # Heuristic: if the "current" value is far too small compared to the old price,
                # treat it as non-product (EMI/metadata) and use the old price instead.
                if old_price >= 5000 and primary_price < int(old_price * 0.2):
                    price = old_price
                else:
                    price = primary_price
            else:
                price = primary_price

        # Stock check
        # TechLand shows availability as text like "In Stock" / "Out Of Stock" in a <p>.
        # Relying on `card.text` is unreliable with Scrapling for nested content, so we
        # instead extract specific <p> text, with an HTML fallback.
        in_stock = True
        stock_text = ""
        if card:
            for p in card.css("p"):
                t = (p.text or "").strip()
                tl = t.lower()
                if not t:
                    continue
                if "stock" in tl or "pre order" in tl or "pre-order" in tl:
                    stock_text = tl
                    break

            if not stock_text:
                html = (card.html_content or "").lower()
                if "out of stock" in html:
                    stock_text = "out of stock"
                elif "in stock" in html:
                    stock_text = "in stock"
                elif "pre order" in html or "pre-order" in html:
                    stock_text = "pre order"

        if stock_text:
            in_stock = ("in stock" in stock_text) and ("out of stock" not in stock_text)
            if "pre order" in stock_text or "pre-order" in stock_text:
                in_stock = False

        products.append({
            "name": name,
            "price": price,
            "image": image,
            "url": product_url,
            "in_stock": in_stock
        })

    return name_elements  # return so caller can check count for early stop


def scrape(category: str, price_min=None, price_max=None, sort_order=None):
    if category not in URL_MAP:
        raise ValueError(f"Category '{category}' not mapped for techland")

    base_url = URL_MAP[category]
    fetcher = Fetcher()
    all_products = []

    sort_params = {}
    if sort_order == "price_desc":
        sort_params = {"sort": "p.price", "order": "DESC"}
    elif sort_order == "price_asc":
        sort_params = {"sort": "p.price", "order": "ASC"}

    filter_params = {}
    if price_min is not None:
        filter_params["filter_min_price"] = int(price_min)
    if price_max is not None:
        filter_params["filter_max_price"] = int(price_max)

    for page_num in range(1, 50 + 1): # Increase limit drastically to fetch all
        page_params = {"page": page_num} if page_num > 1 else {}
        url = build_url(base_url, {**sort_params, **filter_params, **page_params})
        page = fetcher.get(url)
        name_elements = scrape_page(page, all_products)

        if not name_elements:
            break  # no products on this page — stop

        if len(name_elements) < 10:
            break  # last page (partial), stop early

        # Early-stop fast path for sorted requests.
        # When the listing is already sorted by price, additional pages rarely improve the
        # best candidate selection for our use-case (pick cheapest / best within budget).
        if sort_order in {"price_asc", "price_desc"}:
            priced_in_stock = 0
            for p in all_products:
                if p.get("price") is not None and p.get("in_stock"):
                    priced_in_stock += 1
                    if priced_in_stock >= FAST_STOP_MIN_ITEMS:
                        break
            if priced_in_stock >= FAST_STOP_MIN_ITEMS:
                break

    if price_min is not None:
        all_products = [p for p in all_products if p["price"] is not None and p["price"] >= int(price_min)]
    if price_max is not None:
        all_products = [p for p in all_products if p["price"] is not None and p["price"] <= int(price_max)]

    return all_products

