from scrapling import Fetcher
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

MAX_PAGES = 3

def scrape_page(page, products):
    name_elements = page.css("h4 a")

    for name_elem in name_elements:
        name = name_elem.text.strip()
        if not name:
            continue

        product_url = name_elem.attrib.get("href", "")

        # Safe traversal: a -> h4 -> parent div (product card)
        h4 = name_elem.parent
        parent = h4.parent if h4 else None
        if not parent:
            continue

        img_elem = get_first(parent, "img")
        if img_elem:
            image = (img_elem.attrib.get("data-src") or 
                     img_elem.attrib.get("src") or 
                     img_elem.attrib.get("data-lazy-src") or "")
        else:
            image = ""

        # Price — first span containing ৳ with digits is the current/sale price
        price_text = ""
        for span in parent.css("span"):
            t = span.text.strip()
            if "৳" in t and any(c.isdigit() for c in t):
                price_text = t
                break

        price = clean_price(price_text)

        # Stock check
        card_text = parent.text.lower()
        in_stock = "out of stock" not in card_text

        products.append({
            "name": name,
            "price": price,
            "image": image,
            "url": product_url,
            "in_stock": in_stock
        })

    return name_elements  # return so caller can check count for early stop


def scrape(category: str):
    if category not in URL_MAP:
        raise ValueError(f"Category '{category}' not mapped for techland")

    base_url = URL_MAP[category]
    fetcher = Fetcher()
    all_products = []

    for page_num in range(1, MAX_PAGES + 1):
        url = base_url if page_num == 1 else f"{base_url}?page={page_num}"
        page = fetcher.get(url)
        name_elements = scrape_page(page, all_products)

        if not name_elements:
            break  # no products on this page — stop

        if len(name_elements) < 10:
            break  # last page (partial), stop early

    return all_products

