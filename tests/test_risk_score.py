import unittest


class RiskScoreTests(unittest.TestCase):
    # ── S3 심각도 믹스 ──
    def test_severity_mix_weighted_average(self):
        from core.risk_score import severity_mix
        # 낙상(0.9) 8건 + 클레임(0.1) 2건 → (0.9*8 + 0.1*2)/10 = 0.74
        score = severity_mix({"낙상": 8, "클레임": 2}, {"낙상": 0.9, "클레임": 0.1})
        self.assertAlmostEqual(score, 0.74, places=4)

    def test_severity_mix_missing_label_defaults_half(self):
        from core.risk_score import severity_mix
        # 가중치에 없는 유형 → 기본 0.5
        score = severity_mix({"미지유형": 4}, {"낙상": 0.9})
        self.assertAlmostEqual(score, 0.5, places=4)

    def test_severity_mix_empty_returns_half(self):
        from core.risk_score import severity_mix
        self.assertAlmostEqual(severity_mix({}, {"낙상": 0.9}), 0.5, places=4)

    # ── S1 조건 위험도 ──
    def test_condition_risk_maps_levels(self):
        # enrich_leaf_rule 실패해도 graceful 0.5 (빈 규칙)
        from core.risk_score import condition_risk
        v = condition_risk("", {})
        self.assertTrue(0.0 <= v <= 1.0)

    # ── S2 사례 근접도 ──
    def test_case_proximity_closer_is_higher(self):
        from core.risk_score import case_proximity
        fs = {"temperature_2m_min": {"iqr": 10.0}}
        today_w = {"temperature_2m_min": 0.0}
        # 가까운 사례(Δ=0)가 먼 사례(Δ=20)보다 근접도 높아야
        near = case_proximity([{"temperature_2m_min": 0.0}], today_w, {}, fs)
        far = case_proximity([{"temperature_2m_min": 20.0}], today_w, {}, fs)
        self.assertGreater(near, far)

    def test_case_proximity_no_stats_returns_zero(self):
        from core.risk_score import case_proximity
        self.assertEqual(case_proximity([{"x": 1}], {}, {}, {}), 0.0)

    def test_case_proximity_empty_incidents_returns_zero(self):
        from core.risk_score import case_proximity
        self.assertEqual(case_proximity([], {}, {}, {"x": {"iqr": 1.0}}), 0.0)

    # ── G 신뢰도 게이트 ──
    def test_confidence_gate_blocks_low(self):
        from core.risk_score import confidence_gate
        self.assertFalse(confidence_gate("low"))
        self.assertTrue(confidence_gate("med"))
        self.assertTrue(confidence_gate("high"))

    def test_confidence_gate_high_only(self):
        from core.risk_score import confidence_gate
        self.assertFalse(confidence_gate("med", policy="high_only"))
        self.assertTrue(confidence_gate("high", policy="high_only"))

    # ── 통합 compute_risk_score ──
    def _base_kwargs(self):
        fs = {"temperature_2m_min": {"iqr": 10.0}}
        return dict(
            rule_str="",
            class_counts={"낙상": 10},
            incidents=[{"temperature_2m_min": 0.0, "leaf_id": 1}],
            today_weather={"temperature_2m_min": 0.0},
            today_store={},
            feature_stats=fs,
            severity_weights={"낙상": 0.9},
        )

    def test_low_confidence_blocks_trigger(self):
        from core.risk_score import compute_risk_score
        r = compute_risk_score(confidence="low", **self._base_kwargs())
        self.assertFalse(r["trigger"])
        self.assertIn("gated", r["reason"])

    def test_high_severity_only_when_high_confidence(self):
        from core.risk_score import compute_risk_score
        kw = self._base_kwargs()
        # 점수를 확실히 θ_high 위로: 낙상 근접 + 고심각
        r_hi = compute_risk_score(confidence="high",
                                  thresholds={"theta_score": 0.1, "theta_high": 0.1}, **kw)
        self.assertTrue(r_hi["trigger"])
        self.assertEqual(r_hi["severity"], "high")
        # med면 severity high 안 됨
        r_md = compute_risk_score(confidence="med",
                                  thresholds={"theta_score": 0.1, "theta_high": 0.1}, **kw)
        self.assertEqual(r_md["severity"], "normal")

    def test_high_threshold_suppresses_trigger(self):
        from core.risk_score import compute_risk_score
        r = compute_risk_score(confidence="high",
                               thresholds={"theta_score": 0.99, "theta_high": 0.99},
                               **self._base_kwargs())
        self.assertFalse(r["trigger"])
        self.assertIn("below", r["reason"])

    def test_score_monotonic_in_severity(self):
        from core.risk_score import compute_risk_score
        kw = self._base_kwargs()
        kw_low = {**kw, "class_counts": {"클레임": 10}, "severity_weights": {"클레임": 0.1, "낙상": 0.9}}
        kw_high = {**kw, "class_counts": {"낙상": 10}, "severity_weights": {"클레임": 0.1, "낙상": 0.9}}
        r_low = compute_risk_score(confidence="high", **kw_low)
        r_high = compute_risk_score(confidence="high", **kw_high)
        self.assertGreater(r_high["risk_score"], r_low["risk_score"])

    def test_output_schema(self):
        from core.risk_score import compute_risk_score
        r = compute_risk_score(confidence="med", **self._base_kwargs())
        for key in ("risk_score", "signals", "confidence", "trigger", "severity", "reason"):
            self.assertIn(key, r)
        for s in ("S1", "S2", "S3"):
            self.assertIn(s, r["signals"])


if __name__ == "__main__":
    unittest.main()
