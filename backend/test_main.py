import unittest
from unittest.mock import AsyncMock, patch

import httpx

from backend.main import app


class InterviewApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        )

    async def asyncTearDown(self) -> None:
        await self.client.aclose()

    async def test_interviewer_response_exposes_ended_state(self) -> None:
        generated = {
            "message": "Good. How would this change under high write volume?",
            "ended": False,
            "end_reason": None,
        }
        with patch("backend.main.complete_json", new_callable=AsyncMock) as complete:
            complete.return_value = generated
            response = await self.client.post(
                "/api/interview/next",
                json={"topic": "databases", "difficulty": "Hard", "conversation": []},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), generated)

    async def test_start_interview_requests_first_question_without_history(self) -> None:
        generated = {
            "message": "What is normalization?",
            "ended": False,
            "end_reason": None,
        }
        with patch("backend.main.complete_json", new_callable=AsyncMock) as complete:
            complete.return_value = generated
            response = await self.client.post(
                "/api/interview/start",
                json={"topic": "databases", "difficulty": "Easy"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), generated)
        self.assertEqual(complete.await_args.args[1]["conversation"], [])

    async def test_answer_endpoint_requires_candidate_as_latest_turn(self) -> None:
        with patch("backend.main.complete_json", new_callable=AsyncMock) as complete:
            response = await self.client.post(
                "/api/interview/answer",
                json={
                    "topic": "databases",
                    "difficulty": "Easy",
                    "conversation": [
                        {"role": "interviewer", "content": "What is normalization?"}
                    ],
                },
            )

        self.assertEqual(response.status_code, 422)
        complete.assert_not_awaited()

    async def test_invalid_input_returns_friendly_field_errors(self) -> None:
        response = await self.client.post(
            "/api/interview/start",
            json={"topic": "", "difficulty": "Impossible"},
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "Please check your input and try again.")
        self.assertEqual(len(response.json()["errors"]), 2)

    async def test_answer_endpoint_returns_next_message_and_end_state(self) -> None:
        generated = {
            "message": "Thanks. That concludes the interview.",
            "ended": True,
            "end_reason": "coverage_complete",
        }
        with patch("backend.main.complete_json", new_callable=AsyncMock) as complete:
            complete.return_value = generated
            response = await self.client.post(
                "/api/interview/answer",
                json={
                    "topic": "databases",
                    "difficulty": "Easy",
                    "conversation": [
                        {"role": "interviewer", "content": "What is normalization?"},
                        {"role": "candidate", "content": "It reduces data duplication."},
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), generated)
        self.assertEqual(
            complete.await_args.args[1]["conversation"][-1]["role"], "candidate"
        )

    async def test_cors_allows_localhost_on_any_development_port(self) -> None:
        for origin in ("http://localhost:5173", "http://127.0.0.1:8080"):
            with self.subTest(origin=origin):
                response = await self.client.options(
                    "/api/interview/start",
                    headers={
                        "Origin": origin,
                        "Access-Control-Request-Method": "POST",
                    },
                )
                self.assertEqual(response.headers.get("access-control-allow-origin"), origin)

    async def test_report_derives_bands_and_pass_result_from_score(self) -> None:
        cases = [
            (85, "Excellent", "Pass"),
            (70, "Good", "Pass"),
            (55, "Adequate", "Pass"),
            (54, "Weak", "Fail"),
        ]
        for score, expected_band, expected_result in cases:
            with self.subTest(score=score):
                generated = {
                    "score": score,
                    "strengths": [
                        {"evidence": "ETags validate cached responses", "assessment": "Accurate."}
                    ],
                    "weaknesses": [],
                    "topics_to_revise": [],
                    "overall_verdict": "Assessment based on the provided answer.",
                }
                with patch(
                    "backend.main.complete_json", new_callable=AsyncMock
                ) as complete:
                    complete.return_value = generated
                    response = await self.client.post(
                        "/api/report",
                        json={
                            "topic": "HTTP caching",
                            "difficulty": "Medium",
                            "conversation": [
                                {
                                    "role": "candidate",
                                    "content": "ETags validate cached responses on revalidation.",
                                }
                            ],
                        },
                    )

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["performance_band"], expected_band)
                self.assertEqual(response.json()["result"], expected_result)

    async def test_report_rejects_evidence_not_in_candidate_answer(self) -> None:
        generated = {
            "score": 80,
            "strengths": [
                {"evidence": "invented claim", "assessment": "Accurate."}
            ],
            "weaknesses": [],
            "topics_to_revise": [],
            "overall_verdict": "Assessment based on the provided answer.",
        }
        with patch("backend.main.complete_json", new_callable=AsyncMock) as complete:
            complete.return_value = generated
            response = await self.client.post(
                "/api/report",
                json={
                    "topic": "HTTP caching",
                    "difficulty": "Medium",
                    "conversation": [
                        {"role": "candidate", "content": "An ETag supports revalidation."}
                    ],
                },
            )

        self.assertEqual(response.status_code, 502)
        self.assertIn("evidence", response.json()["detail"])

    async def test_report_requires_a_candidate_answer(self) -> None:
        with patch("backend.main.complete_json", new_callable=AsyncMock) as complete:
            response = await self.client.post(
                "/api/report",
                json={"topic": "HTTP caching", "difficulty": "Easy", "conversation": []},
            )

        self.assertEqual(response.status_code, 422)
        complete.assert_not_awaited()

    async def test_provider_rate_limit_returns_friendly_retry_message(self) -> None:
        provider_error = RuntimeError("provider rate limit")
        provider_error.status_code = 429
        groq_client = AsyncMock()
        groq_client.chat.completions.create.side_effect = provider_error
        with patch("backend.main.get_groq_client", return_value=groq_client):
            response = await self.client.post(
                "/api/interview/start",
                json={"topic": "databases", "difficulty": "Easy"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("rate-limiting", response.json()["detail"])

    async def test_unavailable_model_returns_configuration_message(self) -> None:
        provider_error = RuntimeError("model not found")
        provider_error.status_code = 404
        groq_client = AsyncMock()
        groq_client.chat.completions.create.side_effect = provider_error
        with patch("backend.main.get_groq_client", return_value=groq_client):
            response = await self.client.post(
                "/api/interview/start",
                json={"topic": "databases", "difficulty": "Easy"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("GROQ_MODEL", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()