import unittest


class RuleRetrieverTests(unittest.TestCase):
    def test_build_feature_rules_uses_tree_split_thresholds(self):
        from scripts.build_rule_incidents import build_feature_rules_from_tree

        leaf_table = {
            "1": {
                "rule": "평수 <= 299.75 & wind_speed_10m_max <= 1.995",
            },
            "2": {
                "rule": "평수 > 299.75 & 평수 <= 405.0 & wind_speed_10m_max > 1.995",
            },
        }
        incidents = [
            {
                "incident_id": "cust_1",
                "사고유형": "낙상",
                "사고내용요약": "고객이 통로 박스에 걸려 넘어짐",
                "평수": 180,
                "wind_speed_10m_max": 1.0,
            },
            {
                "incident_id": "cust_2",
                "사고유형": "충돌",
                "사고내용요약": "고객이 넓은 매장 코너에서 진열대와 충돌",
                "평수": 360,
                "wind_speed_10m_max": 4.0,
            },
        ]

        rules = build_feature_rules_from_tree("cust", leaf_table, incidents, "사고유형")

        self.assertEqual(
            [rule["val"] for rule in rules["평수"].values()],
            [299.75, 405.0, 405.0],
        )
        self.assertIn("<= 299.75", rules["평수"])
        self.assertIn("> 299.75~<= 405", rules["평수"])
        self.assertIn("> 405", rules["평수"])
        self.assertNotIn("소형", rules["평수"])
        self.assertIn("고객", rules["평수"]["<= 299.75"]["risk"])
        self.assertIn("통로 박스", rules["평수"]["<= 299.75"]["risk"])

    def test_source_thresholds_have_different_risk_language(self):
        from core.rule_enrichment import classify_feature_bucket, get_feature_thresholds

        cust = get_feature_thresholds("cust")
        emp = get_feature_thresholds("emp")

        self.assertIn("precipitation_sum", cust)
        self.assertIn("precipitation_sum", emp)
        self.assertIn("고객", cust["precipitation_sum"]["많은비"]["risk"])
        self.assertIn("직원", emp["precipitation_sum"]["많은비"]["risk"])

        bucket = classify_feature_bucket("cust", "precipitation_sum", 12.0)
        self.assertEqual(bucket["label"], "많은비")
        self.assertIn("고객", bucket["risk"])

    def test_match_incidents_by_rules_prefers_shared_buckets(self):
        from core.rule_retriever import match_incidents_by_rules

        store = {"평수": 180, "창고": 4, "일평균물동량": 120}
        weather = {
            "precipitation_sum": 12.0,
            "rain_sum": 12.0,
            "wind_speed_10m_max": 8.0,
            "temperature_2m_min": 3.0,
        }
        incidents = [
            {
                "incident_id": "cust_old",
                "발생일시": "2024-01-01",
                "사고내용요약": "맑은 날 계단에서 넘어짐",
                "precipitation_sum": 0.0,
                "rain_sum": 0.0,
                "wind_speed_10m_max": 1.0,
                "temperature_2m_min": 10.0,
                "평수": 500,
                "창고": 30,
                "일평균물동량": 500,
            },
            {
                "incident_id": "cust_match_recent",
                "발생일시": "2026-01-10",
                "사고내용요약": "비 오는 날 입구 바닥에서 미끄러짐",
                "precipitation_sum": 13.0,
                "rain_sum": 13.0,
                "wind_speed_10m_max": 8.5,
                "temperature_2m_min": 4.0,
                "평수": 190,
                "창고": 3,
                "일평균물동량": 150,
            },
            {
                "incident_id": "cust_match_older",
                "발생일시": "2025-12-01",
                "사고내용요약": "우천 시 고객이 출입구에서 넘어짐",
                "precipitation_sum": 11.0,
                "rain_sum": 11.0,
                "wind_speed_10m_max": 7.0,
                "temperature_2m_min": 2.0,
                "평수": 170,
                "창고": 5,
                "일평균물동량": 130,
            },
        ]

        leaf_data = match_incidents_by_rules(
            "cust", store, weather, incidents, limit=2, strategy="recent"
        )

        self.assertEqual(leaf_data["rule"], "rule-based-cust")
        self.assertEqual(leaf_data["summary"]["total"], 2)
        self.assertEqual(
            [inc["incident_id"] for inc in leaf_data["incidents"]],
            ["cust_match_recent", "cust_match_older"],
        )
        self.assertGreaterEqual(
            leaf_data["incidents"][0]["rule_match"]["matched_count"],
            leaf_data["incidents"][1]["rule_match"]["matched_count"],
        )


if __name__ == "__main__":
    unittest.main()
