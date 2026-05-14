import unittest

from lambdas.batch.handler import _build_message_body as build_batch_message
from lambdas.notify.handler import _build_message_body as build_notify_message


NEW_GUIDE_SCHEMA_RESULTS = {
    "cust": {
        "guide": {
            "위험_요약": "우천으로 입구 미끄러짐 주의",
            "주요_위험유형": "낙상(우천)",
            "오늘의_주의사항": [
                {
                    "incident_id": "cust_0001",
                    "사고내용": "입구에서 미끄러짐",
                    "수칙": "입구 매트를 교체하고 물기를 즉시 제거하세요.",
                }
            ],
            "부주의_주의사항": [
                "계단 이용 시 손잡이를 잡도록 안내하세요.",
            ],
        }
    },
    "emp": {
        "guide": {
            "위험_요약": "입고 작업 중 중량물 취급 주의",
            "주요_위험유형": "무리한 동작",
            "오늘의_주의사항": [
                {
                    "incident_id": "emp_0001",
                    "사고내용": "박스 이동 중 허리 통증",
                    "수칙": "중량물은 2인 1조로 운반하세요.",
                }
            ],
            "부주의_주의사항": [
                "통로 적재물을 수시로 정리하세요.",
            ],
        }
    },
}


class GuideSchemaContractTest(unittest.TestCase):
    def test_notify_message_uses_current_guide_schema(self):
        body = build_notify_message("테스트점", "2026-05-14", NEW_GUIDE_SCHEMA_RESULTS)

        self.assertIn("[오늘 주의]", body)
        self.assertIn("입구 매트를 교체하고 물기를 즉시 제거하세요.", body)
        self.assertIn("중량물은 2인 1조로 운반하세요.", body)
        self.assertIn("[상시 주의]", body)
        self.assertIn("계단 이용 시 손잡이를 잡도록 안내하세요.", body)

    def test_batch_message_uses_current_guide_schema(self):
        body = build_batch_message("테스트점", "2026-05-14", NEW_GUIDE_SCHEMA_RESULTS)

        self.assertIn("[오늘 주의]", body)
        self.assertIn("입구 매트를 교체하고 물기를 즉시 제거하세요.", body)
        self.assertIn("중량물은 2인 1조로 운반하세요.", body)
        self.assertIn("[상시 주의]", body)
        self.assertIn("통로 적재물을 수시로 정리하세요.", body)


if __name__ == "__main__":
    unittest.main()
