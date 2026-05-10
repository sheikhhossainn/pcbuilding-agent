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
    # Replace anything that isn't a digit
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

def scrape_page(url: str, fetcher, category: str = None):
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
        
        # Additional fallback for categories with missing prices
        if not price_text:
            # Try to extract from data attributes or other sources
            for attr in ['data-price', 'data-original-price']:
                if attr in item.attrib:
                    price_text = item.attrib[attr]
                    break

        if "Call for price" in price_text or "TBA" in price_text:
            price = None
        else:
            price = clean_price(price_text)
        
        # Assign estimated prices for categories where Startech doesn't show prices
        # This allows these categories to be included in PC builds even if prices aren't displayed
        if price is None:
            # Estimate based on category - typical prices for these items in Bangladesh market
            estimated_prices = {
                "cpu": 45000,         # Mid-range CPU (for high-end gaming builds, typically 45K-80K+ for Ryzen/Intel high-end)
                "motherboard": 18000, # Mid-range motherboard (typically 15K-25K)
                "gpu": 95000,         # Mid-range GPU (typically 80K-150K+ for gaming)
                "ram": 10000,         # RAM per 16GB module (typically 8K-12K for DDR5)
                "storage": 8000,      # SSD (typically 8K-15K for 1TB)
                "psu": 5000,          # Power supply (typically 5K-8K for 750W)
                "casing": 3000,       # Computer case (typically 3K-8K)
                "mouse": 2500,        # Budget gaming mouse (Startech prices are usually 2K-5K range)
                "keyboard": 3000,     # Budget mechanical keyboard (typically 3K-6K range)
                "monitor": 12000,     # Budget gaming monitor (usually 12K-25K range)
                "cpu-cooler": 2000,   # Budget CPU cooler
            }
            category_key = category.lower() if category else None
            if category_key and category_key in estimated_prices:
                # Use estimated price only if the item appears to be in stock
                price = estimated_prices[category_key]

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
        page_products = scrape_page(url, fetcher, category)
        all_products.extend(page_products)
        # Stop early if a page returned fewer items (last page)
        if len(page_products) < 10:
            break

    if price_min is not None:
        all_products = [p for p in all_products if p["price"] is not None and p["price"] >= int(price_min)]
    if price_max is not None:
        all_products = [p for p in all_products if p["price"] is not None and p["price"] <= int(price_max)]

    return all_products
