import unittest


class RuleMatcherTests(unittest.TestCase):
    def test_compute_leaf_id_executes_exported_tree_rules(self):
        from core.rule_matcher import compute_leaf_id

        tree_rules = {
            "root": 0,
            "nodes": {
                "0": {
                    "type": "split",
                    "feature": "precipitation_sum",
                    "threshold": 3.5,
                    "left": 1,
                    "right": 2,
                },
                "1": {"type": "leaf", "leaf_id": 1},
                "2": {
                    "type": "split",
                    "feature": "wind_speed_10m_max",
                    "threshold": 6.0,
                    "left": 3,
                    "right": 4,
                },
                "3": {"type": "leaf", "leaf_id": 3},
                "4": {"type": "leaf", "leaf_id": 4},
            },
        }

        features = {"precipitation_sum": 12.0, "wind_speed_10m_max": 4.0}

        self.assertEqual(compute_leaf_id(features, tree_rules), "3")

    def test_match_with_fallback_reads_leaf_data_by_computed_leaf_id(self):
        from core.rule_matcher import match_with_fallback

        tree_rules = {
            "root": 0,
            "nodes": {
                "0": {
                    "type": "split",
                    "feature": "precipitation_sum",
                    "threshold": 3.5,
                    "left": 1,
                    "right": 2,
                },
                "1": {"type": "leaf", "leaf_id": 1},
                "2": {"type": "leaf", "leaf_id": 2},
            },
        }
        leaf_table = {
            "1": {"rule": "precipitation_sum <= 3.5", "summary": {"total": 20}},
            "2": {"rule": "precipitation_sum > 3.5", "summary": {"total": 30}},
        }

        leaf_id, leaf_data, fallback_level = match_with_fallback(
            {"precipitation_sum": 5.0}, tree_rules, leaf_table, {}, {}
        )

        self.assertEqual(leaf_id, "2")
        self.assertEqual(leaf_data["summary"]["total"], 30)
        self.assertEqual(fallback_level, 0)

    def test_exported_tree_rules_match_sklearn_apply(self):
        import pandas as pd
        from sklearn.tree import DecisionTreeClassifier

        from core.rule_matcher import compute_leaf_id
        from scripts.train import _export_tree_rules

        X = pd.DataFrame(
            [
                {"precipitation_sum": 0.0, "wind_speed_10m_max": 1.0},
                {"precipitation_sum": 1.0, "wind_speed_10m_max": 3.0},
                {"precipitation_sum": 10.0, "wind_speed_10m_max": 4.0},
                {"precipitation_sum": 12.0, "wind_speed_10m_max": 9.0},
            ]
        )
        y = ["낙상", "낙상", "충돌", "충돌"]
        tree = DecisionTreeClassifier(max_depth=2, random_state=42)
        tree.fit(X, y)

        tree_rules = _export_tree_rules(
            tree,
            list(X.columns),
            "cust",
            {"max_depth": 2, "random_state": 42},
            {"accuracy": 1.0, "f1_macro": 1.0},
        )

        for idx, row in X.iterrows():
            expected = str(tree.apply(X.iloc[[idx]])[0])
            actual = compute_leaf_id(row.to_dict(), tree_rules)
            self.assertEqual(actual, expected)


if __name__ == "__main__":
    unittest.main()
