import re
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

TRACKING_PARAM_PREFIXES = ('utm_',)
TRACKING_PARAM_EXACT = {
    'fbclid', 'gclid', 'gbraid', 'wbraid', 'msclkid',
    'mc_cid', 'mc_eid', 'yclid', '_ga', '_gl', 'ref', 'ref_',
    'source', 'si'
}


def clean_price(text):
    """Extract numeric price from text like '13,800৳' or 'Tk 12,500'.
    
    Returns None if text is empty or contains no digits.
    NOTE: Always pass the single element holding the selling price,
    never a parent containing both regular and sale prices.
    """
    if not text:
        return None
    digits = re.sub(r'[^\d]', '', str(text))
    if not digits:
        return None
    return int(digits)


def strip_tracking(url: str) -> str:
    """Strip common tracking query parameters and fragment from URL to ensure stable upsert keys."""
    if not url:
        return ""
    url = url.strip()
    parsed = urlsplit(url)
    if not parsed.query:
        if parsed.fragment:
            return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, '', ''))
        return url

    query_items = parse_qsl(parsed.query, keep_blank_values=True)
    filtered = []
    for k, v in query_items:
        kl = k.lower()
        if any(kl.startswith(prefix) for prefix in TRACKING_PARAM_PREFIXES):
            continue
        if kl in TRACKING_PARAM_EXACT:
            continue
        filtered.append((k, v))

    new_query = urlencode(filtered)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, ''))
