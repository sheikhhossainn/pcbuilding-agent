from scrapling import Fetcher
import re

# ComputerMania usually specializes in laptops, their component categories might be limited
URL_MAP = {
    "cpu": "https://computermania.com.bd/product-category/processor/",
    "motherboard": "https://computermania.com.bd/product-category/motherboard/",
    "ram": "https://computermania.com.bd/product-category/ram/",
    "gpu": "https://computermania.com.bd/product-category/graphics-card/",
    "storage": "https://computermania.com.bd/product-category/ssd/",
    "psu": "https://computermania.com.bd/product-category/power-supply/",
    "casing": "https://computermania.com.bd/product-category/casing/",
    "cpu-cooler": "https://computermania.com.bd/product-category/cpu-cooler/"
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

def scrape(category: str):
    if category not in URL_MAP:
        raise ValueError(f"Category '{category}' not mapped for computermania")

    url = URL_MAP[category]
    fetcher = Fetcher()
    page = fetcher.get(url)

    products = []
    
    # Typical WooCommerce structure (ComputerMania is often Woo)
    items = page.css(".product")
    
    for item in items:
        # Extract name and url
        name_elem = get_first(item, ".woocommerce-loop-product__title")
        url_elem = get_first(item, "a.woocommerce-LoopProduct-link")
        
        if not name_elem or not url_elem:
            continue
            
        name = name_elem.text.strip()
        product_url = url_elem.attrib.get("href", "")

        # Image
        img_elem = get_first(item, "img.attachment-woocommerce_thumbnail")
        image = img_elem.attrib.get("src", "") if img_elem else ""

        # Price
        price_elem = get_first(item, ".price")
        price_text = ""
        if price_elem:
            # get the actual price, often there is an ins and del tag for sales
            ins_elem = get_first(price_elem, "ins")
            if ins_elem:
                price_text = ins_elem.text.strip()
            else:
                price_text = price_elem.text.strip()
        
        if "Call for price" in price_text or "TBA" in price_text:
            price = None
        else:
            price = clean_price(price_text)

        # Stock status
        in_stock = True
        btn_elem = get_first(item, ".add_to_cart_button")
        if not btn_elem:
            # Check for out of stock text
            out_of_stock_elem = get_first(item, ".out-of-stock")
            if out_of_stock_elem:
                in_stock = False

        products.append({
            "name": name,
            "price": price,
            "image": image,
            "url": product_url,
            "in_stock": in_stock
        })

    return products
