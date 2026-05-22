from DrissionPage import ChromiumPage, ChromiumOptions
import re
import time

# ComputerMania BD — WooCommerce / Woodmart theme
# Uses DrissionPage (Chrome DevTools Protocol) to bypass Cloudflare JS challenge
URL_MAP = {
    "cpu":       "https://computermania.com.bd/product-category/desktop-components/processor/",
    "motherboard": "https://computermania.com.bd/product-category/desktop-components/motherboard/",
    "ram":       "https://computermania.com.bd/product-category/desktop-components/desktop-ram/",
    "gpu":       "https://computermania.com.bd/product-category/desktop-components/graphics-card/",
    "storage":   "https://computermania.com.bd/product-category/ssd/",
    "psu":       "https://computermania.com.bd/product-category/desktop-components/power-supply/",
    "casing":    "https://computermania.com.bd/product-category/desktop-components/case/",
    "cpu-cooler": "https://computermania.com.bd/product-category/desktop-components/cpu-cooler/",
    "monitor":   "https://computermania.com.bd/product-category/monitor/",
    "mouse":     "https://computermania.com.bd/product-category/accessories/mouse/",
    "keyboard":  "https://computermania.com.bd/product-category/accessories/keyboard/",
}

# HDD products are listed under a separate URL but belong to storage
STORAGE_HDD_URL = "https://computermania.com.bd/product-category/desktop-components/hard-disk-drive/"


def clean_price(text):
    """Extract numeric price from WooCommerce bdi text like '13,800৳ '."""
    if not text:
        return None
    digits = re.sub(r'[^\d]', '', text)
    if not digits:
        return None
    return int(digits)


def wait_for_cloudflare(page, timeout=300):
    """Wait for Cloudflare 'Just a moment...' challenge to clear (up to 5 minutes)."""
    for i in range(timeout):
        title = page.title or ""
        if "just a moment" not in title.lower() and title.strip():
            print(f"    Cloudflare cleared after {i}s")
            return True
        if i > 0 and i % 60 == 0:
            print(f"    Still loading... {i}s elapsed")
        time.sleep(1)
    print(f"    Cloudflare timeout after {timeout}s - page may not have loaded")
    return False


def parse_products_from_page(page, retries=3):
    """Extract product data from a loaded DrissionPage.
    
    HTML structure (Woodmart/WooCommerce):
        div.product-grid-item.instock  (or .outofstock)
    """
    for attempt in range(retries):
        products = []
        try:
            page.wait.ele_displayed("css:.product-grid-item", timeout=60)  # Wait up to 60s for products
            items = page.eles("css:.product-grid-item")

            for item in items:
                # ── Product Name & URL ──
                name = ""
                product_url = ""
                try:
                    name_el = item.ele("css:h3.wd-entities-title a")
                    name = (name_el.text or "").strip()
                    product_url = name_el.attr("href") or ""
                except Exception:
                    pass

                if not name:
                    continue

                # ── Product Image ──
                image = ""
                try:
                    img_el = item.ele("css:img")
                    if img_el:
                        image = (img_el.attr("src") or
                                 img_el.attr("data-src") or "")
                        if image.startswith("data:"):
                            image = (img_el.attr("data-src") or
                                     img_el.attr("data-lazy-src") or "")
                except Exception:
                    pass

                # ── Price ──
                price = None
                try:
                    # Sale price takes priority (inside <ins>)
                    ins_bdi = item.ele("css:.price ins bdi")
                    price = clean_price(ins_bdi.text)
                except Exception:
                    try:
                        # Regular price (no sale)
                        bdi = item.ele("css:.price bdi")
                        price = clean_price(bdi.text)
                    except Exception:
                        try:
                            price_el = item.ele("css:.price")
                            price = clean_price(price_el.text)
                        except Exception:
                            pass

                # ── Stock Status ──
                in_stock = True
                item_classes = (item.attr("class") or "").lower()
                if "outofstock" in item_classes:
                    in_stock = False
                elif "instock" not in item_classes:
                    # If neither marker is present, check for add-to-cart button
                    try:
                        cart_btn = item.ele("css:.add_to_cart_button")
                        if not cart_btn:
                            in_stock = False
                    except Exception:
                        pass

                products.append({
                    "name": name,
                    "price": price,
                    "image": image,
                    "url": product_url,
                    "in_stock": in_stock
                })

            # If we get here without an exception, return the products
            return products

        except Exception as e:
            # If Cloudflare reloads the page, elements become invalid. Retry.
            if attempt < retries - 1:
                time.sleep(3)
            else:
                print(f"  [computermania] Parsing failed after {retries} retries: {e}")
                return []

    return []


def scrape(category: str, price_min=None, price_max=None, sort_order=None):
    """Scrape all pages for a category from ComputerMania BD.
    
    Uses DrissionPage (Chrome DevTools Protocol) to bypass Cloudflare.
    Once CF clears on the first page, subsequent pages reuse the session cookies.
    Only returns in-stock items.
    """
    if category not in URL_MAP:
        raise ValueError(f"Category '{category}' not mapped for computermania")

    base_url = URL_MAP[category]
    all_products = []

    # ── Launch browser ──
    co = ChromiumOptions()
    co.set_argument('--window-position=-2000,-2000')
    co.set_argument('--no-sandbox')
    co.set_argument('--disable-gpu')
    page = ChromiumPage(co)

    def get_max_pages():
        """Read the pagination bar on the current page and return the last page number."""
        try:
            links = page.eles("css:.page-numbers a")
            nums = []
            for link in links:
                txt = (link.text or "").strip()
                if txt.isdigit():
                    nums.append(int(txt))
            return max(nums) if nums else 1
        except Exception:
            return 1

    try:
        max_pages = 1
        failed_pages = []

        for page_num in range(1, 200):  # safe upper bound; we break when done
            url = base_url if page_num == 1 else f"{base_url.rstrip('/')}/page/{page_num}/"

            try:
                print(f"    Page {page_num}...", end=" ", flush=True)
                page.get(url)

                if not wait_for_cloudflare(page):
                    print("Cloudflare timeout, trying anyway...")

                # On the first page, detect how many pages exist
                if page_num == 1:
                    max_pages = get_max_pages()
                    print(f"(detected {max_pages} pages)")

                page_products = parse_products_from_page(page)

                # Keep only in-stock items
                page_products = [p for p in page_products if p.get('in_stock', True)]

                if not page_products:
                    if page_num < max_pages:
                        # Possibly a Cloudflare glitch — skip and continue
                        print("No products, but more pages expected — skipping")
                        failed_pages.append(page_num)
                        time.sleep(2)
                        continue
                    else:
                        print("No products (end of pagination)")
                        break

                print(f"{len(page_products)} items")
                all_products.extend(page_products)

                if page_num >= max_pages:
                    break

            except Exception as e:
                print(f"Error on page {page_num}: {e}")
                failed_pages.append(page_num)
                time.sleep(2)
                continue

        if failed_pages:
            print(f"  Note: pages {failed_pages} had errors but scraping continued")

        # ── HDD sub-category for storage ──
        if category == "storage":
            try:
                print("    HDD page...", end=" ", flush=True)
                page.get(STORAGE_HDD_URL)
                if wait_for_cloudflare(page):
                    hdd_products = parse_products_from_page(page)
                    hdd_products = [p for p in hdd_products if p.get('in_stock', True)]
                    if hdd_products:
                        print(f"{len(hdd_products)} items")
                        all_products.extend(hdd_products)
                    else:
                        print("No products")
            except Exception as e:
                print(f"Error scraping HDD page: {e}")

    finally:
        page.quit()

    # Client-side price filters
    if price_min is not None:
        all_products = [p for p in all_products if p.get("price") and p["price"] >= int(price_min)]
    if price_max is not None:
        all_products = [p for p in all_products if p.get("price") and p["price"] <= int(price_max)]

    # Final safety: only in-stock items
    all_products = [p for p in all_products if p.get('in_stock', True)]

    return all_products

