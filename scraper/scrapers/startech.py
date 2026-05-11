from scrapling import Fetcher
from urllib.parse import urlencode, urlparse, parse_qsl, urlunparse
import re

URL_MAP = {
    "cpu": "https://www.startech.com.bd/component/processor",
    "motherboard": "https://www.startech.com.bd/component/motherboard",
    "ram": "https://www.startech.com.bd/component/ram",
    "gpu": "https://www.startech.com.bd/component/graphics-card",
    "storage": "https://www.startech.com.bd/ssd",
    "psu": "https://www.startech.com.bd/component/power-supply",
    "casing": "https://www.startech.com.bd/component/casing",
    "cpu-cooler": "https://www.startech.com.bd/component/cpu-cooler",
    "monitor": "https://www.startech.com.bd/monitor",
    "mouse": "https://www.startech.com.bd/accessories/mouse",
    "keyboard": "https://www.startech.com.bd/accessories/keyboards"
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

MAX_PAGES = 3

def build_url(base_url, params):
    url_parts = list(urlparse(base_url))
    query = dict(parse_qsl(url_parts[4]))
    query.update({k: v for k, v in params.items() if v is not None})
    url_parts[4] = urlencode(query)
    return urlunparse(url_parts)

def scrape_page(url: str, fetcher):
    page = fetcher.get(url)
    products = []

    items = page.css(".p-item")
    for item in items:
        name_elem = get_first(item, ".p-item-name a")
        if not name_elem:
            continue
        name = name_elem.text.strip()
        product_url = name_elem.attrib.get("href", "")

        img_elem = get_first(item, ".p-item-img img")
        if img_elem:
            image = (img_elem.attrib.get("data-src") or
                     img_elem.attrib.get("src") or
                     img_elem.attrib.get("data-lazy-src") or "")
        else:
            image = ""

        # Price parsing
        # Some listings show both new and old prices: "<span class=price-new>3900৳</span> <span class=price-old>3950৳</span>"
        # Others show only a status (Up Coming / Out Of Stock) instead of a numeric price.
        price = None
        price_new_elem = get_first(item, ".p-item-price span.price-new")
        if price_new_elem:
            price = clean_price(price_new_elem.text.strip())
        else:
            # Pick the first span that contains digits (and ignore status-only spans)
            for span in item.css(".p-item-price span"):
                t = (span.text or "").strip()
                if any(ch.isdigit() for ch in t):
                    price = clean_price(t)
                    break

        # Stock detection
        in_stock = True
        status_text = " ".join([s.text.strip().lower() for s in item.css(".p-item-price span") if s.text]).strip()
        if "out of stock" in status_text or "up coming" in status_text:
            in_stock = False
        stock_elem = get_first(item, ".p-item-btn .btn")
        if stock_elem:
            btn_text = (stock_elem.text or "").lower()
            if "out of stock" in btn_text or "stock out" in btn_text:
                in_stock = False

        products.append({
            "name": name,
            "price": price,
            "image": image,
            "url": product_url,
            "in_stock": in_stock
        })

    return products


def scrape(category: str, price_min=None, price_max=None, sort_order=None):
    if category not in URL_MAP:
        raise ValueError(f"Category '{category}' not mapped for startech")

    base_url = URL_MAP[category]
    fetcher = Fetcher()
    all_products = []

    sort_params = {}
    # IMPORTANT: For some StarTech categories, adding sort params makes the site replace
    # numeric prices with status text like "Up Coming" in the HTML.
    # We avoid server-side sorting for those categories and rely on client-side sorting
    # in the backend instead.
    NO_SERVER_SORT_CATEGORIES = {"ram", "storage"}
    if category not in NO_SERVER_SORT_CATEGORIES:
        if sort_order == "price_desc":
            sort_params = {"sort": "p.price", "order": "DESC"}
        elif sort_order == "price_asc":
            sort_params = {"sort": "p.price", "order": "ASC"}

    filter_params = {}
    if price_min is not None:
        filter_params["filter_min_price"] = int(price_min)
    if price_max is not None:
        filter_params["filter_max_price"] = int(price_max)

    max_pages = 8 if category == "ram" else MAX_PAGES
    for page_num in range(1, max_pages + 1):
        page_params = {"page": page_num} if page_num > 1 else {}
        url = build_url(base_url, {**sort_params, **filter_params, **page_params})
        page_products = scrape_page(url, fetcher)
        all_products.extend(page_products)
        if len(page_products) < 10:
            break

    if price_min is not None:
        all_products = [p for p in all_products if p["price"] is not None and p["price"] >= int(price_min)]
    if price_max is not None:
        all_products = [p for p in all_products if p["price"] is not None and p["price"] <= int(price_max)]

    return all_products