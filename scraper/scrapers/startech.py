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

        price_elem = get_first(item, ".p-item-price span")
        price_text = price_elem.text.strip() if price_elem else ""
        if not price_text or "Call for price" in price_text or "TBA" in price_text:
            price_elem_main = get_first(item, ".p-item-price")
            if price_elem_main:
                price_text = price_elem_main.text.strip()

        if not price_text:
            for attr in ['data-price', 'data-original-price']:
                if attr in item.attrib:
                    price_text = item.attrib[attr]
                    break

        if "Call for price" in price_text or "TBA" in price_text:
            price = None
        else:
            price = clean_price(price_text)

        stock_elem = get_first(item, ".p-item-btn .btn")
        in_stock = True
        if stock_elem:
            btn_text = stock_elem.text.lower()
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
        page_products = scrape_page(url, fetcher)
        all_products.extend(page_products)
        if len(page_products) < 10:
            break

    if price_min is not None:
        all_products = [p for p in all_products if p["price"] is not None and p["price"] >= int(price_min)]
    if price_max is not None:
        all_products = [p for p in all_products if p["price"] is not None and p["price"] <= int(price_max)]

    return all_products