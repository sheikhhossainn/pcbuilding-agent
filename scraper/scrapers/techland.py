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

import time

def safe_fetch(fetcher, url, max_retries=3):
    """Fetch URL with automatic retry and exponential backoff on network errors."""
    for attempt in range(max_retries):
        try:
            page = fetcher.get(url)
            if page and getattr(page, 'status', None) == 200:
                return page
            time.sleep(1.5 * (attempt + 1))
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"[Techland] Network error fetching {url} after {max_retries} attempts: {e}")
                return None
            time.sleep(1.5 * (attempt + 1))
    return None

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
    # Support new TechLand v2 layout (.v2-card-title) as well as legacy layout (h4 a)
    v2_titles = page.css(".v2-card-title")
    if v2_titles:
        for title_elem in v2_titles:
            name = (title_elem.text or "").strip()
            if not name:
                continue

            # Find URL from parent <a> or child <a>
            a = title_elem.parent if getattr(title_elem.parent, 'tag', '') == 'a' else None
            if not a:
                a_list = title_elem.css("a")
                if a_list:
                    a = a_list[0]
            product_url = a.attrib.get("href", "") if a else ""

            # Card container
            card = title_elem
            for _ in range(6):
                if card.parent:
                    card = card.parent
                    attribs = card.attrib or {}
                    if "wire:key" in attribs or "listing-card" in str(attribs.get("class", "")):
                        break

            # Image
            image = ""
            img_elems = card.css("img")
            if img_elems:
                image = (img_elems[0].attrib.get("src") or
                         img_elems[0].attrib.get("data-src") or
                         img_elems[0].attrib.get("data-lazy-src") or "")

            # Price extraction
            price = None
            price_elems = card.css(".bengali-text, span, div")
            regular_prices = []
            old_prices = []
            for pe in price_elems:
                txt = (pe.text or "").strip()
                if "৳" in txt and not any(w in txt.lower() for w in ["save", "/mo", "off"]):
                    digits = re.sub(r'[^\d]', '', txt)
                    if digits:
                        val = int(digits)
                        cls = (pe.attrib.get("class") or "").lower()
                        if "line-through" in cls:
                            old_prices.append(val)
                        else:
                            regular_prices.append(val)

            if regular_prices:
                price = regular_prices[0]
            elif old_prices:
                price = old_prices[0]

            # In-stock check
            buttons = card.css("button")
            btn_text = " ".join((b.text or "") for b in buttons).lower()
            card_html = (card.html_content or "").lower()
            if "out of stock" in btn_text or "out of stock" in card_html:
                in_stock = False
            elif "add to cart" in btn_text or "addedtocart" in card_html:
                in_stock = True
            elif "pre order" in btn_text or "pre-order" in btn_text:
                in_stock = False
            else:
                in_stock = True

            products.append({
                "name": name,
                "price": price,
                "image": image,
                "url": product_url,
                "in_stock": in_stock
            })

        return v2_titles

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
                if not bold_text and ("font-bold" in cls) and ("line-through" not in cls):
                    bold_text = t

            primary_text = bold_text or (candidates[0] if candidates else "")
            primary_price = clean_price(primary_text)
            old_price = clean_price(old_text)

            if primary_price is not None and old_price is not None:
                if old_price >= 5000 and primary_price < int(old_price * 0.2):
                    price = old_price
                else:
                    price = primary_price
            else:
                price = primary_price

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

    for page_num in range(1, 60 + 1): # Fetch up to 60 pages
        page_params = {"page": page_num} if page_num > 1 else {}
        url = build_url(base_url, {**sort_params, **filter_params, **page_params})
        page = safe_fetch(fetcher, url)
        if not page:
            break
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

