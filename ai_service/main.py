import asyncio
import hashlib
import hmac
import json
import logging
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from ai_service.gemini_service import GeminiService, GeminiUnavailable, MODEL_DEFAULT
from ai_service.retrieval import (
    AccessDenied,
    CaseNotFound,
    UnsupportedQuestion,
    retrieve_context,
)


ROOT_DIRECTORY = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIRECTORY / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("northgate.ai")

MAX_QUESTIONS_PER_MINUTE = 8
MAX_CONCURRENT_REQUESTS = 4
REQUEST_TIMEOUT_SECONDS = 30
SAFE_ASSISTANT_TASKS = {
    "aggregate_stage_analytics": "Summarize the retrieved aggregate stage-duration metrics only.",
    "overdue_documents": "List the retrieved cases with overdue documents, their document names, and deterministic follow-up dates.",
    "due_today_documents": "List the retrieved cases with a document follow-up due today and name only the matching outstanding documents.",
    "longest_waiting_documents": "Summarize the retrieved cases and outstanding documents ordered by application-computed wait age.",
    "case_documents": "Summarize the outstanding documents in the retrieved authorised case.",
    "client_documents": "Summarize the outstanding documents in the retrieved authorised client case.",
    "blocked_ownership_documents": "Explain which retrieved outstanding ownership or registry documents relate to the requested manual handoff context; do not make a UBO decision.",
    "draft_reminder": "Write an editable reminder draft using only the listed documents, RM, case identifier, and supplied due date. Use a short 'Subject: ' line first; the rest is the message body. The assigned RM must review and approve it.",
}


class AssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=3, max_length=1000)


class AssistantResponse(BaseModel):
    answer: str
    sources: list[dict[str, str]]
    model: str
    reminderDraft: dict[str, Any] | None = None


def create_app(
    database_path: str | Path | None = None,
    model_service: GeminiService | Any | None = None,
    internal_token: str | None = None,
    overdue_days: int | None = None,
    request_timeout_seconds: int = REQUEST_TIMEOUT_SECONDS,
    rate_limit_per_minute: int = MAX_QUESTIONS_PER_MINUTE,
) -> FastAPI:
    db_path = Path(database_path or os.getenv("NG_DATABASE_PATH", ROOT_DIRECTORY / "northgate.sqlite")).resolve()
    gemini = model_service or GeminiService()
    expected_internal_token = internal_token if internal_token is not None else os.getenv("AI_SERVICE_TOKEN", "")
    configured_overdue_days = overdue_days or int(os.getenv("NG_OVERDUE_DAYS", "7"))
    rate_limits: dict[str, deque[float]] = defaultdict(deque)
    rate_limit_lock = asyncio.Lock()
    model_semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield

    application = FastAPI(
        title="Northgate Chase AI service",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )
    application.state.gemini = gemini
    application.state.database_path = db_path
    application.state.rate_limits = rate_limits
    application.state.rate_limit_lock = rate_limit_lock
    application.state.model_semaphore = model_semaphore
    application.state.expected_internal_token = expected_internal_token
    application.state.overdue_days = configured_overdue_days
    application.state.request_timeout_seconds = request_timeout_seconds

    async def verify_internal_request(
        request: Request,
        supplied_token: Annotated[str | None, Header(alias="x-ai-service-token")] = None,
    ) -> None:
        expected = request.app.state.expected_internal_token
        if not expected or not supplied_token or not hmac.compare_digest(expected, supplied_token):
            raise HTTPException(status_code=401, detail="Unauthorised internal assistant request.")

    async def check_rate_limit(request: Request, role: str, actor: str) -> None:
        now = time.monotonic()
        key = f"{role}:{actor}"
        async with request.app.state.rate_limit_lock:
            requests = request.app.state.rate_limits[key]
            while requests and now - requests[0] >= 60:
                requests.popleft()
            if len(requests) >= rate_limit_per_minute:
                raise HTTPException(
                    status_code=429,
                    detail="Assistant rate limit reached. Wait briefly, then try again.",
                )
            requests.append(now)

    @application.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "geminiConfigured": bool(gemini.is_configured),
            "model": gemini.model,
            "realEmailSending": False,
            "syntheticDataOnly": True,
        }

    @application.post("/ask", response_model=AssistantResponse, dependencies=[Depends(verify_internal_request)])
    async def ask_assistant(request: Request, body: AssistantRequest) -> AssistantResponse:
        role = request.headers.get("x-demo-role", "")
        actor = request.headers.get("x-demo-actor", "")
        if not role or not actor:
            raise HTTPException(status_code=401, detail="A validated demo role is required.")

        try:
            retrieval, sources, draft_details = retrieve_context(
                request.app.state.database_path,
                role,
                actor,
                body.question.strip(),
                request.app.state.overdue_days,
            )
        except AccessDenied as error:
            raise HTTPException(status_code=403, detail=str(error)) from error
        except CaseNotFound as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except UnsupportedQuestion as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except (OSError, ValueError) as error:
            logger.error("Retrieval failed: error_type=%s role=%s", type(error).__name__, role)
            raise HTTPException(status_code=503, detail="Case data is temporarily unavailable.") from error

        if not request.app.state.gemini.is_configured:
            raise HTTPException(
                status_code=503,
                detail="Gemini is not configured. Set GEMINI_API_KEY in the backend environment.",
            )
        await check_rate_limit(request, role, actor)

        started = time.monotonic()
        question_digest = hashlib.sha256(body.question.strip().encode("utf-8")).hexdigest()[:12]
        try:
            async with request.app.state.model_semaphore:
                answer = await asyncio.wait_for(
                    request.app.state.gemini.answer(
                        SAFE_ASSISTANT_TASKS[retrieval["questionIntent"]],
                        json.dumps(retrieval, ensure_ascii=True, separators=(",", ":")),
                    ),
                    timeout=request.app.state.request_timeout_seconds,
                )
        except GeminiUnavailable as error:
            logger.warning(
                "Gemini request unavailable: role=%s question_id=%s elapsed_ms=%d",
                role,
                question_digest,
                round((time.monotonic() - started) * 1000),
            )
            raise HTTPException(status_code=error.status_code, detail=str(error)) from error
        except asyncio.TimeoutError as error:
            logger.warning("Gemini request timed out: role=%s question_id=%s", role, question_digest)
            raise HTTPException(status_code=504, detail="Assistant timed out. Please try again.") from error

        logger.info(
            "Assistant request completed: role=%s question_id=%s source_count=%d draft=%s elapsed_ms=%d",
            role,
            question_digest,
            len(sources),
            draft_details is not None,
            round((time.monotonic() - started) * 1000),
        )
        return AssistantResponse(
            answer=answer,
            sources=sources,
            model=request.app.state.gemini.model,
            reminderDraft=draft_details,
        )

    return application


app = create_app()
