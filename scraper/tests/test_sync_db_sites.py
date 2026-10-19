"""Offline tests for how sync_db wires sites together. Nothing here touches the network or Turso:
every function that would write to the database or the state file is patched."""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SCRAPER_DIR = Path(__file__).resolve().parent.parent
if str(SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPER_DIR))

import sync_db


class FakeScraper:
    """Stands in for a scraper module: scrape() returns one priced item or raises on a chosen category."""

    def __init__(self, fail_on=None):
        self.fail_on = fail_on
        self.scraped = []
        self.close_calls = 0

    def scrape(self, category):
        self.scraped.append(category)
        if category == self.fail_on:
            raise RuntimeError(f"{category} page 2 failed")
        return [{"name": f"{category} item", "price": 100000, "image": "", "url": f"https://x/{category}", "in_stock": True}]

    def close(self):
        self.close_calls += 1


def _quiet(_msg):
    pass


@patch("sync_db.time.sleep")
@patch("sync_db.save_state")
@patch("sync_db.mark_stale_out_of_stock", return_value=0)
@patch("sync_db.upsert_to_turso")
class TestScrapeSite(unittest.TestCase):
    def test_close_called_once_after_success(self, _upsert, _stale, _save, _sleep):
        module = FakeScraper()
        site = {"name": "fake", "module": module, "categories": ["cpu", "ram"]}
        state = {"fake": 0}

        self.assertTrue(sync_db._scrape_site(site, state, _quiet, _quiet, None))
        self.assertEqual(module.scraped, ["cpu", "ram"])
        self.assertEqual(module.close_calls, 1)
        self.assertEqual(state["fake"], 2)

    def test_close_called_once_when_scrape_raises(self, upsert, stale, _save, _sleep):
        module = FakeScraper(fail_on="ram")
        site = {"name": "fake", "module": module, "categories": ["cpu", "ram", "gpu"]}
        state = {"fake": 0}

        self.assertFalse(sync_db._scrape_site(site, state, _quiet, _quiet, None))
        self.assertEqual(module.close_calls, 1)
        # Paused at the failing category; nothing after it was scraped.
        self.assertEqual(state["fake"], 1)
        self.assertEqual(module.scraped, ["cpu", "ram"])
        # The failing category never reached the stale check, so no stock flags were touched for it.
        self.assertEqual([c.args[1] for c in stale.call_args_list], ["cpu"])

    def test_module_without_close_is_fine(self, _upsert, _stale, _save, _sleep):
        class NoClose:
            def scrape(self, category):
                return []

        site = {"name": "fake", "module": NoClose(), "categories": ["cpu"]}
        self.assertTrue(sync_db._scrape_site(site, {"fake": 0}, _quiet, _quiet, None))


class TestSites(unittest.TestCase):
    def test_ryans_registered_with_all_categories(self):
        if sync_db.ryans is None:
            self.skipTest("ryans scraper dependencies not installed")
        ryans = next((s for s in sync_db.SITES if s["name"] == "ryans"), None)
        self.assertIsNotNone(ryans)
        self.assertEqual(len(ryans["categories"]), 12)
        self.assertIs(ryans["module"], sync_db.ryans)

    def test_fresh_state_covers_every_site(self):
        self.assertEqual(sync_db.fresh_state(), {s["name"]: 0 for s in sync_db.SITES})

    def test_parse_sites_arg(self):
        self.assertEqual(sync_db.parse_sites_arg(" StarTech , techland"), ["startech", "techland"])
        with self.assertRaises(ValueError):
            sync_db.parse_sites_arg("nosuchshop")
        with self.assertRaises(ValueError):
            sync_db.parse_sites_arg(" , ")


class TestRunSyncSelectedSites(unittest.TestCase):
    def setUp(self):
        self.sites = [
            {"name": "startech", "module": FakeScraper(), "categories": ["cpu", "ram"]},
            {"name": "ryans", "module": FakeScraper(), "categories": ["cpu", "ram"]},
        ]
        self.saved = []

    def _run(self, state, sites):
        submitted = []

        def fake_scrape_site(site_info, st, log, progress, stop_event):
            submitted.append(site_info["name"])
            st[site_info["name"]] = len(site_info["categories"])
            return True

        with patch.object(sync_db, "SITES", self.sites), \
             patch("sync_db.load_state", return_value=state), \
             patch("sync_db.save_state", side_effect=lambda s: self.saved.append(dict(s))), \
             patch("sync_db._scrape_site", side_effect=fake_scrape_site):
            sync_db.run_sync(log_callback=_quiet, sites=sites)
        return submitted

    def test_only_selected_site_runs_and_others_keep_their_state(self):
        submitted = self._run({"startech": 1, "ryans": 0}, ["ryans"])

        self.assertEqual(submitted, ["ryans"])
        # The completion reset only touches ryans; startech's half-done progress survives.
        self.assertEqual(self.saved[-1], {"startech": 1, "ryans": 0})

    def test_already_complete_selected_site_restarts_without_touching_others(self):
        submitted = self._run({"startech": 2, "ryans": 2}, ["ryans"])

        self.assertEqual(submitted, ["ryans"])
        for saved in self.saved:
            self.assertEqual(saved["startech"], 2)

    def test_no_sites_argument_runs_every_site(self):
        submitted = self._run({"startech": 0, "ryans": 0}, None)

        self.assertEqual(sorted(submitted), ["ryans", "startech"])
        self.assertEqual(self.saved[-1], {"startech": 0, "ryans": 0})


if __name__ == "__main__":
    unittest.main()
