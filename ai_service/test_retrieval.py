import sqlite3
import tempfile
import unittest
from pathlib import Path

from ai_service.retrieval import (
    AccessDenied,
    open_read_only_database,
    retrieve_context,
)


ROOT = Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "server" / "migrations" / "001_initial.sql"


def create_test_database(database_path: Path) -> None:
    connection = sqlite3.connect(database_path)
    connection.executescript(MIGRATION.read_text(encoding="utf-8"))
    connection.execute(
        """INSERT INTO cases (
            id, client_name, industry, rm_name, days_open, current_stage,
            contact_name, contact_email, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            "NG-2026-8101",
            "Synthetic Cedar Maritime Ltd",
            "Shipping",
            "Sarah Jenkins",
            20,
            "Ownership and UBO",
            "Synthetic Contact",
            "contact@client.example",
            "2026-01-01T09:00:00+00:00",
            "2026-01-20T09:00:00+00:00",
        ),
    )
    connection.execute(
        """INSERT INTO cases (
            id, client_name, industry, rm_name, days_open, current_stage,
            contact_name, contact_email, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            "NG-2026-8102",
            "Synthetic Summit Infrastructure Ltd",
            "Energy",
            "Marcus Vance",
            12,
            "Document Intake",
            "Synthetic Contact Two",
            "contact+2@client.example",
            "2026-01-01T09:00:00+00:00",
            "2026-01-12T09:00:00+00:00",
        ),
    )
    connection.executemany(
        """INSERT INTO documents (
            id, case_id, name, category, status, owner, requested_at, chase_round,
            received_at, waived_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [
            (
                "DOC-8101-1", "NG-2026-8101", "Certified Group Organisation Chart",
                "Ownership and UBO", "REQUESTED", "Client",
                "2026-01-01T09:00:00+00:00", 3, None, None,
            ),
            (
                "DOC-8101-2", "NG-2026-8101", "Certificate of Incorporation",
                "Constitutional Documents", "RECEIVED", "Client",
                "2026-01-01T09:00:00+00:00", 1, "2026-01-03T09:00:00+00:00", None,
            ),
        ],
    )
    connection.execute(
        """INSERT INTO handoffs (
            id, case_id, document_id, analyst_name, target_rm, message, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)""",
        (
            "handoff-synthetic", "NG-2026-8101", "DOC-8101-1",
            "Liam Chen", "Sarah Jenkins", "Synthetic missing-document request.",
            "2026-01-02T09:00:00+00:00",
        ),
    )
    connection.execute(
        "INSERT INTO stage_durations (case_id, stage, duration_days, completed_at) VALUES (?, ?, ?, ?)",
        ("NG-2026-8101", "Chasing Missing Docs", 16, "2026-01-20T09:00:00+00:00"),
    )
    connection.commit()
    connection.close()


class RetrievalTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.database_path = Path(self.directory.name) / "northgate-test.sqlite"
        create_test_database(self.database_path)

    def tearDown(self) -> None:
        self.directory.cleanup()

    def test_reads_only_role_authorised_case_facts_without_contact_information(self) -> None:
        context, sources, draft = retrieve_context(
            self.database_path,
            "RM",
            "Sarah Jenkins",
            "What documents are missing for NG-2026-8101?",
        )

        self.assertEqual(context["accessibleCases"][0]["caseId"], "NG-2026-8101")
        self.assertEqual(
            [item["name"] for item in context["accessibleCases"][0]["outstandingDocuments"]],
            ["Certified Group Organisation Chart"],
        )
        self.assertNotIn("contactEmail", str(context))
        self.assertNotIn("contact_name", str(context))
        self.assertTrue(any(source.get("documentId") == "DOC-8101-1" for source in sources))
        self.assertIsNone(draft)

    def test_rejects_access_to_another_relationship_manager_portfolio(self) -> None:
        with self.assertRaises(AccessDenied):
            retrieve_context(
                self.database_path,
                "RM",
                "Marcus Vance",
                "What documents are missing for NG-2026-8101?",
            )

    def test_rejects_forged_role_actor_pair(self) -> None:
        with self.assertRaises(AccessDenied):
            retrieve_context(
                self.database_path,
                "OPS",
                "Sarah Jenkins",
                "Which cases are overdue?",
            )

    def test_coo_receives_only_aggregate_data(self) -> None:
        context, sources, draft = retrieve_context(
            self.database_path,
            "COO",
            "Morgan Ellis",
            "Which stage has the longest median duration?",
        )

        self.assertEqual(context["kind"], "aggregate-analytics")
        self.assertNotIn("accessibleCases", context)
        self.assertNotIn("Synthetic Cedar Maritime Ltd", str(context))
        self.assertEqual(sources[0]["kind"], "analytics")
        self.assertIsNone(draft)

    def test_coo_cannot_query_a_named_case(self) -> None:
        with self.assertRaises(AccessDenied):
            retrieve_context(
                self.database_path,
                "COO",
                "Morgan Ellis",
                "What is missing for NG-2026-8101?",
            )

    def test_rm_can_create_draft_with_database_verified_missing_document_ids(self) -> None:
        context, _, draft = retrieve_context(
            self.database_path,
            "RM",
            "Sarah Jenkins",
            "Draft a reminder for NG-2026-8101",
        )

        self.assertEqual(context["kind"], "reminder-draft")
        self.assertEqual(draft["caseId"], "NG-2026-8101")
        self.assertEqual(draft["documentIds"], ["DOC-8101-1"])
        self.assertTrue(draft["dueAt"])

    def test_ops_cannot_request_ai_reminder_approval_draft(self) -> None:
        with self.assertRaises(AccessDenied):
            retrieve_context(
                self.database_path,
                "OPS",
                "Ops Coordinator",
                "Draft a reminder for NG-2026-8101",
            )

    def test_sql_connection_is_read_only(self) -> None:
        with open_read_only_database(self.database_path) as connection:
            with self.assertRaises(sqlite3.OperationalError):
                connection.execute("DELETE FROM cases")


if __name__ == "__main__":
    unittest.main()
