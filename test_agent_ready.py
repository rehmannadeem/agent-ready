"""Offline tests: no network. Run with  python -m unittest -v"""
import unittest

import agent_ready as ar


def perfect():
    return {
        "platform": {"status": 200, "is_shopify": True, "myshopify_domain": "x.myshopify.com"},
        "ucp": {"present": True, "version": ar.KNOWN_LATEST_UCP, "mcp_endpoint": "https://x/api/ucp/mcp",
                "capabilities": list(ar.CORE_CAPABILITIES), "payment_handlers": ["dev.shopify.card"],
                "missing_core": []},
        "backend_ucp_present": False,
        "mcp": {"live": True, "server": "universal-commerce", "tools": ["search_catalog", "get_product"]},
        "policies": {"refund": True, "shipping": True, "privacy": True, "terms": True, "alt_urls": {}},
        "robots": {"status": 200, "blocked_discovery": [], "blocked_training": []},
        "product": {"product_url": "https://x/products/a", "jsonld": True, "price": True,
                    "availability": True, "brand": True, "image": True, "description": True,
                    "gtin": True, "sku": True},
    }


class Scoring(unittest.TestCase):
    def test_perfect_store_scores_100(self):
        r = perfect()
        score, grade, findings = ar.score_and_findings(r)
        self.assertEqual(score, 100)
        self.assertEqual(grade, "A")
        self.assertEqual(r["coverage"], 100)
        self.assertEqual(findings, [])

    def test_missing_manifest_is_high(self):
        r = perfect()
        r["ucp"].update(present=False, version=None, mcp_endpoint=None, capabilities=[],
                        missing_core=list(ar.CORE_CAPABILITIES))
        r["mcp"] = {"live": False, "server": None, "tools": []}
        score, grade, findings = ar.score_and_findings(r)
        self.assertEqual(score, 40)
        self.assertEqual(findings[0]["severity"], "HIGH")

    def test_headless_gap_gets_partial_credit_and_specific_finding(self):
        r = perfect()
        r["ucp"].update(present=False, version=None, mcp_endpoint=None, capabilities=[],
                        missing_core=list(ar.CORE_CAPABILITIES))
        r["mcp"] = {"live": False, "server": None, "tools": []}
        r["backend_ucp_present"] = True
        score, _, findings = ar.score_and_findings(r)
        self.assertEqual(score, 55)
        self.assertIn("x.myshopify.com", findings[0]["finding"])

    def test_unreadable_product_page_is_not_a_failure(self):
        r = perfect()
        r["product"] = {"product_url": "https://x/products/a", "inconclusive": True, "status": 429,
                        "jsonld": False, "price": False, "availability": False, "brand": False,
                        "image": False, "description": False, "gtin": False, "sku": False}
        score, _, findings = ar.score_and_findings(r)
        self.assertEqual(score, 100)
        self.assertEqual(r["coverage"], 85)
        self.assertTrue(all(f["severity"] == "INFO" for f in findings))

    def test_empty_policy_shell_is_named_as_empty(self):
        r = perfect()
        r["policies"].update(shipping=False, empty={"shipping": True})
        score, _, findings = ar.score_and_findings(r)
        self.assertEqual(score, 95)
        self.assertIn("exists but is empty", findings[0]["finding"])
        self.assertIn("Settings > Policies", findings[0]["fix"])

    def test_no_product_url_found_is_not_scored_against_store(self):
        r = perfect()
        r["product"] = {"product_url": None, "jsonld": False, "price": False, "availability": False,
                        "brand": False, "image": False, "description": False, "gtin": False, "sku": False}
        score, _, findings = ar.score_and_findings(r)
        self.assertEqual(score, 100)
        self.assertEqual(r["coverage"], 85)
        self.assertEqual(findings[0]["severity"], "INFO")

    def test_policy_elsewhere_is_low_not_high(self):
        r = perfect()
        r["policies"].update(refund=False, alt_urls={"refund": "/pages/returns"})
        _, _, findings = ar.score_and_findings(r)
        self.assertEqual(findings[0]["severity"], "LOW")


class Robots(unittest.TestCase):
    def test_specific_block(self):
        g = ar.parse_robots("User-agent: *\nDisallow: /cart\n\nUser-agent: OAI-SearchBot\nDisallow: /\n")
        self.assertTrue(ar.blocks_whole_site(g, "OAI-SearchBot"))
        self.assertFalse(ar.blocks_whole_site(g, "PerplexityBot"))

    def test_partial_disallow_is_not_whole_site(self):
        g = ar.parse_robots("User-agent: GPTBot\nDisallow: /checkout\n")
        self.assertFalse(ar.blocks_whole_site(g, "GPTBot"))

    def test_shared_group(self):
        g = ar.parse_robots("User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n")
        self.assertTrue(ar.blocks_whole_site(g, "ClaudeBot"))


class JsonLd(unittest.TestCase):
    def test_product_group_with_variants(self):
        page = ('<script type="application/ld+json">{"@context":"https://schema.org",'
                '"@type":"ProductGroup","name":"Shoe","brand":{"name":"B"},'
                '"hasVariant":[{"@type":"Product","gtin13":"123","offers":'
                '{"price":"10","availability":"InStock"}}]}</script>')
        result = ar.analyze_product_page(page)
        self.assertTrue(result["jsonld"])
        self.assertTrue(result["price"])          # read from the variant's offer
        self.assertTrue(result["availability"])
        self.assertTrue(result["gtin"])           # read from the variant
        self.assertTrue(result["brand"])
        self.assertFalse(result["description"])

    def test_no_jsonld(self):
        self.assertFalse(ar.analyze_product_page("<html><body>no data</body></html>")["jsonld"])

    def test_graph(self):
        page = ('<script type="application/ld+json">{"@graph":[{"@type":"Organization"},'
                '{"@type":"Product","name":"A"}]}</script>')
        self.assertEqual(len(ar.extract_jsonld_products(page)), 1)


if __name__ == "__main__":
    unittest.main()
