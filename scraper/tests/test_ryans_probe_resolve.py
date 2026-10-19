import unittest
import sys
from pathlib import Path

SCRAPER_DIR = Path(__file__).resolve().parent.parent
if str(SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPER_DIR))

from tools.ryans_probe import (
    resolve_category_urls_strict,
    get_slug_segments,
    has_consecutive_segments,
    is_slug_excluded,
    match_slug_keyword_tier,
    CANDIDATE_CATEGORIES,
)


class TestRyansProbeResolve(unittest.TestCase):
    def test_parent_beats_processor_intel(self):
        """Parent category /category/desktop-component-processor beats sub-category /…-processor-intel."""
        discovered = {
            "https://www.ryans.com/category/desktop-component-processor": {
                "text": "Processors",
                "url": "https://www.ryans.com/category/desktop-component-processor"
            },
            "https://www.ryans.com/category/desktop-component-processor-intel": {
                "text": "Intel Processors",
                "url": "https://www.ryans.com/category/desktop-component-processor-intel"
            }
        }
        candidates = {
            "cpu": "https://www.ryans.com/category/desktop-component-processor"
        }
        res = resolve_category_urls_strict(discovered, candidates)
        self.assertEqual(
            res["cpu"]["url"],
            "https://www.ryans.com/category/desktop-component-processor"
        )

        # Even if the candidate URL is a generic placeholder, the shorter parent slug beats the brand subcategory
        generic_candidates = {
            "cpu": "https://www.ryans.com/category/cpu"
        }
        res_generic = resolve_category_urls_strict(discovered, generic_candidates)
        self.assertEqual(
            res_generic["cpu"]["url"],
            "https://www.ryans.com/category/desktop-component-processor"
        )
        self.assertEqual(res_generic["cpu"]["source"], "menu match")

    def test_ram_does_not_match_frame(self):
        """'ram' does not match a slug ending in '...-frame' because matching is segment-based."""
        discovered = {
            "https://www.ryans.com/category/accessories-photo-frame": {
                "text": "Photo Frame",
                "url": "https://www.ryans.com/category/accessories-photo-frame"
            }
        }
        candidates = {
            "ram": "https://www.ryans.com/category/desktop-component-desktop-ram"
        }
        res = resolve_category_urls_strict(discovered, candidates)
        # Should not match photo-frame; falls back to candidate
        self.assertEqual(
            res["ram"]["url"],
            "https://www.ryans.com/category/desktop-component-desktop-ram"
        )
        self.assertEqual(res["ram"]["source"], "candidate fallback")

    def test_cpu_does_not_match_cpu_cooler(self):
        """'cpu' category excludes cooler/cooling and does not match 'cpu-cooler'."""
        discovered = {
            "https://www.ryans.com/category/desktop-component-cpu-cooler": {
                "text": "CPU Cooler",
                "url": "https://www.ryans.com/category/desktop-component-cpu-cooler"
            }
        }
        candidates = {
            "cpu": "https://www.ryans.com/category/desktop-component-processor"
        }
        res = resolve_category_urls_strict(discovered, candidates)
        # Should exclude cpu-cooler for cpu and fall back to candidate
        self.assertEqual(
            res["cpu"]["url"],
            "https://www.ryans.com/category/desktop-component-processor"
        )
        self.assertEqual(res["cpu"]["source"], "candidate fallback")

    def test_exact_candidate_url_wins_when_present(self):
        """The exact candidate URL wins and is marked as 'candidate (verified in menu)'."""
        candidate_url = "https://www.ryans.com/category/desktop-component-graphics-card"
        discovered = {
            candidate_url: {
                "text": "Graphics Card",
                "url": candidate_url
            },
            "https://www.ryans.com/category/gpu": {
                "text": "GPU",
                "url": "https://www.ryans.com/category/gpu"
            }
        }
        candidates = {
            "gpu": candidate_url
        }
        res = resolve_category_urls_strict(discovered, candidates)
        self.assertEqual(res["gpu"]["url"], candidate_url)
        self.assertEqual(res["gpu"]["source"], "candidate (verified in menu)")


if __name__ == "__main__":
    unittest.main()
