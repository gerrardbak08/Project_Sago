import unittest


class RuleRetrieverTests(unittest.TestCase):
    def test_common_thresholds_classify_feature_bucket(self):
        from core.rule_enrichment import classify_feature_bucket, get_feature_thresholds

        cust = get_feature_thresholds("cust")
        emp = get_feature_thresholds("emp")

        self.assertIn("precipitation_sum", cust)
        self.assertIn("precipitation_sum", emp)
        self.assertEqual(cust, emp)

        bucket = classify_feature_bucket("cust", "precipitation_sum", 12.0)
        self.assertEqual(bucket["label"], "많은비")
        self.assertEqual(bucket["threshold"], 10.0)

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

    def test_llm_prompt_excludes_rule_risk_context(self):
        from core.llm import build_user_prompt

        prompt = build_user_prompt(
            store={"매장명": "테스트점", "지역": "서울", "형태": "직영점", "평수": 200},
            weather={"precipitation_sum": 12.0},
            leaf_data={
                "rule": "rule-based-cust",
                "rule_context": {
                    "today_buckets": {
                        "precipitation_sum": {
                            "label": "많은비",
                            "risk": "이 설명은 LLM 컨텍스트에 들어가면 안 됩니다.",
                            "value": 12.0,
                        }
                    }
                },
                "summary": {"total": 1, "사고유형": {"낙상": 1}},
                "incidents": [
                    {
                        "incident_id": "cust_0001",
                        "발생일시": "2026-01-01",
                        "사고유형": "낙상",
                        "사고내용요약": "입구 바닥에서 미끄러짐",
                        "precipitation_sum": 10.0,
                        "평수": 210,
                    }
                ],
            },
            label_col="사고유형",
            source="cust",
        )

        self.assertIn("## 유사 조건 과거 사고 사례", prompt)
        self.assertIn("[발생 당시 기상", prompt)
        self.assertIn("[발생 당시 매장", prompt)
        self.assertNotIn("이 설명은 LLM 컨텍스트에 들어가면 안 됩니다.", prompt)
        self.assertNotIn("## 위험 분석", prompt)
        self.assertNotIn("리프 위험 분석", prompt)


if __name__ == "__main__":
    unittest.main()
