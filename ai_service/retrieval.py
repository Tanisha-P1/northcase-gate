import re
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


class AccessDenied(Exception):
    pass


class CaseNotFound(Exception):
    pass


class UnsupportedQuestion(Exception):
    pass


CASE_ID_PATTERN = re.compile(r"\bNG-\d{4}-\d{4}\b", re.IGNORECASE)
VALID_RMS = {
    "Sarah Jenkins",
    "Marcus Vance",
    "Elena Rostova",
    "David Kim",
}
VALID_ROLES = {"RM", "OPS", "ANALYST", "COO"}
ANALYST_ACTOR = "Liam Chen"
OPS_ACTOR = "Ops Coordinator"
COO_ACTOR = "Morgan Ellis"


def _validate_context(role: str, actor: str) -> None:
    if role not in VALID_ROLES:
        raise AccessDenied("This demo role is not permitted to use the assistant.")
    if role == "RM" and actor not in VALID_RMS:
        raise AccessDenied("Select a valid Relationship Manager demo identity.")
    expected_actor = {
        "OPS": OPS_ACTOR,
        "ANALYST": ANALYST_ACTOR,
        "COO": COO_ACTOR,
    }
    if role in expected_actor and actor != expected_actor[role]:
        raise AccessDenied("The selected demo identity does not match this role.")


@contextmanager
def open_read_only_database(database_path: str | Path):
    uri = f"{Path(database_path).resolve().as_uri()}?mode=ro"
    connection = sqlite3.connect(uri, uri=True, timeout=1)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only = ON")
    connection.execute("PRAGMA busy_timeout = 1000")
    try:
        yield connection
    finally:
        connection.close()


def _follow_up(connection: sqlite3.Connection, document: sqlite3.Row, overdue_days: int, today: date) -> dict[str, Any]:
    reminder = connection.execute(
        """SELECT occurred_at FROM events
           WHERE document_id = ? AND event_type = 'REMINDER_SENT'
           ORDER BY occurred_at DESC, id DESC LIMIT 1""",
        (document["id"],),
    ).fetchone()
    start = reminder["occurred_at"] if reminder else document["requested_at"]
    start_date = datetime.fromisoformat(start.replace("Z", "+00:00")).date()
    follow_up_date = start_date + timedelta(days=overdue_days)
    age_days = max((today - datetime.fromisoformat(document["requested_at"].replace("Z", "+00:00")).date()).days, 0)
    return {
        "ageDays": age_days,
        "followUpDate": follow_up_date.isoformat(),
        "status": "OVERDUE" if follow_up_date < today else "DUE_TODAY" if follow_up_date == today else "REQUESTED",
    }


def _case_access(connection: sqlite3.Connection, case_id: str, role: str, actor: str) -> sqlite3.Row:
    case = connection.execute("SELECT id, client_name, rm_name, current_stage FROM cases WHERE id = ?", (case_id,)).fetchone()
    if case is None:
        raise CaseNotFound("That case is not present in the application records.")
    if role == "COO":
        raise AccessDenied("COO assistant access is aggregate-only; case-specific data is not available.")
    if role == "OPS":
        return case
    if role == "RM" and case["rm_name"] == actor:
        return case
    if role == "ANALYST" and connection.execute(
        """SELECT 1 FROM handoffs
           WHERE case_id = ? AND (analyst_name = ? OR target_rm = ?) LIMIT 1""",
        (case_id, actor, actor),
    ).fetchone():
        return case
    raise AccessDenied("This case is outside the selected demo role's authorised view.")


def _outstanding_documents(
    connection: sqlite3.Connection,
    case_id: str,
    overdue_days: int,
    today: date,
) -> list[dict[str, Any]]:
    documents = connection.execute(
        """SELECT id, name, category, owner, requested_at, chase_round
           FROM documents WHERE case_id = ? AND status = 'REQUESTED'
           ORDER BY requested_at ASC""",
        (case_id,),
    ).fetchall()
    return [
        {"id": item["id"], "name": item["name"], "category": item["category"], "owner": item["owner"],
         "requestedAt": item["requested_at"], "chaseRound": item["chase_round"],
         **_follow_up(connection, item, overdue_days, today)}
        for item in documents
    ]


def _source(case_id: str, label: str, kind: str, document_id: str | None = None) -> dict[str, str]:
    result = {"caseId": case_id, "label": label, "kind": kind}
    if document_id:
        result["documentId"] = document_id
    return result


def _case_rows(connection: sqlite3.Connection, role: str, actor: str) -> list[sqlite3.Row]:
    if role == "RM":
        return connection.execute(
            "SELECT id, client_name, rm_name, current_stage FROM cases WHERE rm_name = ?",
            (actor,),
        ).fetchall()
    if role == "ANALYST":
        return connection.execute(
            """SELECT DISTINCT cases.id, cases.client_name, cases.rm_name, cases.current_stage
               FROM cases JOIN handoffs ON handoffs.case_id = cases.id
               WHERE handoffs.analyst_name = ? OR handoffs.target_rm = ?""",
            (actor, actor),
        ).fetchall()
    if role == "OPS":
        return connection.execute(
            "SELECT id, client_name, rm_name, current_stage FROM cases"
        ).fetchall()
    raise AccessDenied("COO assistant access is aggregate-only.")


def _prepare_context(
    connection: sqlite3.Connection,
    role: str,
    actor: str,
    question: str,
    overdue_days: int,
) -> tuple[dict[str, Any], list[dict[str, str]], dict[str, Any] | None]:
    _validate_context(role, actor)
    today = datetime.now(timezone.utc).date()
    case_id_match = CASE_ID_PATTERN.search(question)
    is_draft = bool(re.search(r"\b(draft|write|compose)\b.*\b(reminder|email|follow.?up)\b|\b(reminder|email)\b.*\b(draft|write|compose)\b", question, re.IGNORECASE))

    if role == "COO":
        if case_id_match or re.search(r"\b(client|case|document|rm|ubo|contact)\b", question, re.IGNORECASE):
            raise AccessDenied("The COO assistant can only answer aggregate analytics questions.")
        stage_rows = connection.execute(
            """SELECT stage, duration_days FROM stage_durations
               ORDER BY stage, duration_days"""
        ).fetchall()
        stage_groups: dict[str, list[int]] = {}
        for row in stage_rows:
            stage_groups.setdefault(row["stage"], []).append(row["duration_days"])
        aggregate = {
            "kind": "aggregate-analytics",
            "questionIntent": "aggregate_stage_analytics",
            "casesInDemo": connection.execute("SELECT COUNT(*) FROM cases").fetchone()[0],
            "stages": [
                {"stage": name, "medianDays": sorted(values)[len(values) // 2]}
                for name, values in sorted(stage_groups.items())
            ],
        }
        source = [{"label": "Aggregate stage-duration analytics", "kind": "analytics"}]
        aggregate["sources"] = source
        if is_draft:
            raise UnsupportedQuestion("The COO role cannot create case-specific reminder drafts.")
        return aggregate, source, None

    if case_id_match:
        selected_case = _case_access(connection, case_id_match.group(0).upper(), role, actor)
        cases = [selected_case]
    else:
        cases = _case_rows(connection, role, actor)

    all_case_data: list[dict[str, Any]] = []
    sources: list[dict[str, str]] = []
    matching_client = None
    question_lower = question.casefold()

    for case in cases:
        documents = _outstanding_documents(connection, case["id"], overdue_days, today)
        if case_id_match:
            include = True
        elif any(keyword in question_lower for keyword in ("overdue", "late", "past due")):
            include = any(item["status"] == "OVERDUE" for item in documents)
        elif any(keyword in question_lower for keyword in ("today", "due today")):
            include = any(item["status"] == "DUE_TODAY" for item in documents)
        elif any(keyword in question_lower for keyword in ("longest", "waiting longest", "oldest")):
            include = any(item["status"] != "RECEIVED" for item in documents)
        elif any(keyword in question_lower for keyword in ("ubo", "blocked", "ownership", "registry")):
            include = any(item["category"] in {"Ownership and UBO", "Registry Extracts"} for item in documents)
        elif case["client_name"].casefold() in question_lower:
            include = True
            matching_client = case
        else:
            include = False

        if include:
            matching_documents = documents
            if not case_id_match and any(keyword in question_lower for keyword in ("ubo", "blocked", "ownership", "registry")):
                matching_documents = [
                    item for item in documents
                    if item["category"] in {"Ownership and UBO", "Registry Extracts"}
                ]
            if not case_id_match and matching_client is None and case["client_name"].casefold() not in question_lower:
                matching_documents = [
                    item for item in documents
                    if item["status"] in {"OVERDUE", "DUE_TODAY"}
                    or any(word in question_lower for word in ("longest", "waiting longest", "oldest"))
                ]
            if not case_id_match and matching_client is None and any(word in question_lower for word in ("longest", "waiting longest", "oldest")):
                matching_documents = documents
            all_case_data.append({
                "caseId": case["id"],
                "clientName": case["client_name"],
                "relationshipManager": case["rm_name"],
                "currentStage": case["current_stage"],
                "outstandingDocuments": matching_documents,
            })
            sources.append(_source(case["id"], f"{case['id']} · {case['client_name']}", "case"))
            sources.extend(
                _source(case["id"], item["name"], "document", item["id"])
                for item in matching_documents
            )

    longest_intent = any(word in question_lower for word in ("longest", "waiting longest", "oldest"))
    if is_draft:
        question_intent = "draft_reminder"
    elif case_id_match:
        question_intent = "case_documents"
    elif any(word in question_lower for word in ("overdue", "late", "past due")):
        question_intent = "overdue_documents"
    elif "today" in question_lower:
        question_intent = "due_today_documents"
    elif longest_intent:
        question_intent = "longest_waiting_documents"
    elif any(word in question_lower for word in ("ubo", "blocked", "ownership", "registry")):
        question_intent = "blocked_ownership_documents"
    else:
        question_intent = "client_documents"
    if longest_intent:
        all_case_data.sort(
            key=lambda item: max((doc["ageDays"] for doc in item["outstandingDocuments"]), default=0),
            reverse=True,
        )
        all_case_data = all_case_data[:10]
    else:
        all_case_data = all_case_data[:20]

    sources = []
    for selected_case in all_case_data:
        sources.append(_source(
            selected_case["caseId"],
            f"{selected_case['caseId']} · {selected_case['clientName']}",
            "case",
        ))
        sources.extend(
            _source(selected_case["caseId"], item["name"], "document", item["id"])
            for item in selected_case["outstandingDocuments"]
        )
    sources = sources[:100]
    retrieval_context: dict[str, Any] = {
        "kind": "reminder-draft" if is_draft else "case-lookup",
        "questionIntent": question_intent,
        "asOfDateUtc": today.isoformat(),
        "overdueAfterCalendarDays": overdue_days,
        "accessibleCases": all_case_data,
        "sources": sources,
        "dataNote": "Synthetic training records. Dates, follow-up status, and case access are determined by the application.",
    }
    draft_details = None
    if is_draft:
        if role != "RM":
            raise AccessDenied("Only the assigned RM can request an AI reminder draft.")
        if len(all_case_data) != 1 or not case_id_match:
            raise UnsupportedQuestion("Name one case ID, such as NG-2026-8101, to draft a reminder.")
        outstanding = all_case_data[0]["outstandingDocuments"]
        if not outstanding:
            raise UnsupportedQuestion("This case has no outstanding documents to include in a reminder.")
        draft_details = {
            "caseId": all_case_data[0]["caseId"],
            "documentIds": [item["id"] for item in outstanding],
            "dueAt": (today + timedelta(days=3)).isoformat(),
        }
        retrieval_context["reminderDraftRules"] = {
            "dueAt": draft_details["dueAt"],
            "rmName": all_case_data[0]["relationshipManager"],
            "clientName": all_case_data[0]["clientName"],
            "useOnlyListedOutstandingDocuments": True,
            "draftOnly": True,
            "noKycUboSanctionsOrCreditDecision": True,
        }
    if not all_case_data and not case_id_match and not any(word in question_lower for word in ("overdue", "late", "past due", "today", "longest", "oldest", "ubo", "blocked", "ownership", "registry")):
        raise UnsupportedQuestion("Ask about an authorised case, overdue items, follow-ups due today, longest-waiting documents, or a document-linked handoff.")
    return retrieval_context, sources, draft_details


def retrieve_context(
    database_path: str | Path,
    role: str,
    actor: str,
    question: str,
    overdue_days: int = 7,
) -> tuple[dict[str, Any], list[dict[str, str]], dict[str, Any] | None]:
    with open_read_only_database(database_path) as connection:
        return _prepare_context(connection, role, actor, question, overdue_days)
