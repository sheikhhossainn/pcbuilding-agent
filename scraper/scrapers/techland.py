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
    "keyboard": "https://www.techlandbd.com/accessories/computer-keyboard"
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

        # Price — first span containing ৳ with digits (and not a "save" badge) is the current price
        price_text = ""
        price_container = card or parent
        if price_container:
            for span in price_container.css("span"):
                t = span.text.strip()
                if "৳" in t and any(c.isdigit() for c in t) and "save" not in t.lower() and "/mo" not in t.lower():
                    price_text = t
                    break

        price = clean_price(price_text)

        # Stock check
        card_text = (card.text.lower() if card else "")
        in_stock = "out of stock" not in card_text

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

    for page_num in range(1, MAX_PAGES + 1):
        page_params = {"page": page_num} if page_num > 1 else {}
        url = build_url(base_url, {**sort_params, **filter_params, **page_params})
        page = fetcher.get(url)
        name_elements = scrape_page(page, all_products)

        if not name_elements:
            break  # no products on this page — stop

        if len(name_elements) < 10:
            break  # last page (partial), stop early

    if price_min is not None:
        all_products = [p for p in all_products if p["price"] is not None and p["price"] >= int(price_min)]
    if price_max is not None:
        all_products = [p for p in all_products if p["price"] is not None and p["price"] <= int(price_max)]

    return all_products

