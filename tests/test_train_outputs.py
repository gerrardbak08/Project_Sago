import unittest

import pandas as pd
from sklearn.tree import DecisionTreeClassifier


class TrainOutputTests(unittest.TestCase):
    def test_leaf_table_keeps_all_incidents_in_leaf(self):
        from scripts.build_dataset import STORE_CAT_FEATURES, STORE_NUM_FEATURES, WEATHER_FEATURES
        from scripts.train import _build_leaf_table

        feature_names = WEATHER_FEATURES + STORE_NUM_FEATURES + STORE_CAT_FEATURES
        rows = []
        for idx in range(60):
            row = {feature: 0.0 for feature in feature_names}
            row.update(
                {
                    "incident_id": f"cust_{idx:04d}",
                    "사고유형": "낙상",
                    "사고내용요약": f"사고 {idx}",
                    "image_url": float("nan"),
                }
            )
            rows.append(row)

        df = pd.DataFrame(rows)
        X = df[feature_names]
        tree = DecisionTreeClassifier(random_state=42)
        tree.fit(X, df["사고유형"])

        leaf_table = _build_leaf_table(
            tree,
            df,
            X,
            "사고유형",
            ["사고유형", "사고내용요약"],
            "cust",
            feature_names,
        )

        only_leaf = next(iter(leaf_table.values()))
        self.assertEqual(only_leaf["summary"]["total"], 60)
        self.assertEqual(len(only_leaf["incidents"]), 60)
        self.assertNotIn("sampled", only_leaf["summary"])
        self.assertEqual(only_leaf["incidents"][0]["image_url"], "")


if __name__ == "__main__":
    unittest.main()
