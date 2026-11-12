import json
import tempfile
import asyncio
import unittest
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from ai_service.gemini_service import GeminiUnavailable
from ai_service.main import create_app
from ai_service.test_retrieval import create_test_database


class FakeGemini:
    is_configured = True
    model = "mock-gemini-flash"

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def answer(self, question: str, retrieved_context: str) -> str:
        self.calls.append((question, json.loads(retrieved_context)))
        return "The organisation chart is still outstanding [1]."

class SlowGemini(FakeGemini):
    async def answer(self, question: str, retrieved_context: str) -> str:
        await asyncio.sleep(0.1)
        return "Too late."

class RateLimitedGemini(FakeGemini):
    async def answer(self, question: str, retrieved_context: str) -> str:
        raise GeminiUnavailable("Gemini rate limit reached. Wait briefly, then try again.", status_code=429)


class AssistantApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.database_path = Path(self.directory.name) / "northgate-test.sqlite"
        create_test_database(self.database_path)
        self.gemini = FakeGemini()
        self.app = create_app(
            self.database_path,
            self.gemini,
            internal_token="synthetic-test-secret",
        )
        self.client = TestClient(self.app)
        self.headers = {
            "x-ai-service-token": "synthetic-test-secret",
            "x-demo-role": "RM",
            "x-demo-actor": "Sarah Jenkins",
        }

    def tearDown(self) -> None:
        self.client.close()
        self.directory.cleanup()

    def test_requires_shared_internal_backend_token(self) -> None:
        response = self.client.post(
            "/ask",
            json={"question": "What documents are missing for NG-2026-8101?"},
            headers={"x-demo-role": "OPS", "x-demo-actor": "Ops Coordinator"},
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(len(self.gemini.calls), 0)

    def test_enforces_per_identity_request_rate_limit(self) -> None:
        rate_limited_app = create_app(
            self.database_path,
            FakeGemini(),
            internal_token="synthetic-test-secret",
            rate_limit_per_minute=1,
        )
        with TestClient(rate_limited_app) as client:
            first = client.post(
                "/ask",
                json={"question": "What documents are missing for NG-2026-8101?"},
                headers=self.headers,
            )
            second = client.post(
                "/ask",
                json={"question": "What documents are missing for NG-2026-8101?"},
                headers=self.headers,
            )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)

    def test_returns_gateway_timeout_when_model_exceeds_configured_deadline(self) -> None:
        timeout_app = create_app(
            self.database_path,
            SlowGemini(),
            internal_token="synthetic-test-secret",
            request_timeout_seconds=0,
        )
        with TestClient(timeout_app) as client:
            response = client.post(
                "/ask",
                json={"question": "What documents are missing for NG-2026-8101?"},
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 504)
        self.assertIn("timed out", response.json()["detail"].lower())

    def test_returns_rate_limit_status_when_gemini_quota_is_exhausted(self) -> None:
        rate_limit_app = create_app(
            self.database_path,
            RateLimitedGemini(),
            internal_token="synthetic-test-secret",
        )
        with TestClient(rate_limit_app) as client:
            response = client.post(
                "/ask",
                json={"question": "What documents are missing for NG-2026-8101?"},
                headers=self.headers,
            )

        self.assertEqual(response.status_code, 429)
        self.assertIn("rate limit", response.json()["detail"].lower())

    def test_answers_from_authorised_retrieval_and_returns_source_links(self) -> None:
        response = self.client.post(
            "/ask",
            json={"question": "What documents are missing for NG-2026-8101?"},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertIn("[1]", payload["answer"])
        self.assertEqual(payload["model"], "mock-gemini-flash")
        self.assertTrue(any(
            source.get("documentId") == "DOC-8101-1"
            for source in payload["sources"]
        ))
        self.assertEqual(
            self.gemini.calls[0][1]["accessibleCases"][0]["caseId"],
            "NG-2026-8101",
        )
        self.assertNotIn("NG-2026-8101", self.gemini.calls[0][0])
        self.assertEqual(self.gemini.calls[0][0], "Summarize the outstanding documents in the retrieved authorised case.")

    def test_rejects_question_about_case_outside_selected_rm_portfolio(self) -> None:
        response = self.client.post(
            "/ask",
            json={"question": "What documents are missing for NG-2026-8102?"},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(len(self.gemini.calls), 0)

    def test_coo_case_question_never_reaches_gemini(self) -> None:
        response = self.client.post(
            "/ask",
            json={"question": "Summarize client NG-2026-8101"},
            headers={
                "x-ai-service-token": "synthetic-test-secret",
                "x-demo-role": "COO",
                "x-demo-actor": "Morgan Ellis",
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(len(self.gemini.calls), 0)

    def test_coo_aggregate_query_only_passes_aggregates_to_gemini(self) -> None:
        response = self.client.post(
            "/ask",
            json={"question": "Which stage has the longest median duration?"},
            headers={
                "x-ai-service-token": "synthetic-test-secret",
                "x-demo-role": "COO",
                "x-demo-actor": "Morgan Ellis",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("accessibleCases", self.gemini.calls[0][1])
        self.assertEqual(self.gemini.calls[0][1]["kind"], "aggregate-analytics")

    def test_question_and_model_response_are_not_written_to_request_logs(self) -> None:
        question = "Which documents are missing in NG-2026-8101?"
        with self.assertLogs("northgate.ai", level="INFO") as captured:
            self.client.post("/ask", json={"question": question}, headers=self.headers)

        log_output = " ".join(captured.output)
        self.assertNotIn(question, log_output)
        self.assertNotIn("organisation chart is still outstanding", log_output)
        self.assertIn("question_id=", log_output)

    def test_rejects_unexpected_request_fields(self) -> None:
        response = self.client.post(
            "/ask",
            json={"question": "Which cases are overdue?", "apiKey": "do-not-log-this"},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(len(self.gemini.calls), 0)


if __name__ == "__main__":
    unittest.main()
