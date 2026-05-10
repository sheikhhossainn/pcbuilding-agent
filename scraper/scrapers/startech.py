from scrapling import Fetcher
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

MAX_PAGES = 3  # fetch up to 3 pages per category (~60-90 products)

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


def scrape(category: str):
    if category not in URL_MAP:
        raise ValueError(f"Category '{category}' not mapped for startech")

    base_url = URL_MAP[category]
    fetcher = Fetcher()
    all_products = []

    for page_num in range(1, MAX_PAGES + 1):
        url = base_url if page_num == 1 else f"{base_url}?page={page_num}"
        page_products = scrape_page(url, fetcher)
        all_products.extend(page_products)
        # Stop early if a page returned fewer items (last page)
        if len(page_products) < 10:
            break

    return all_products
