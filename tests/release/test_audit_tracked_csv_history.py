"""Only synthetic Git metadata; never stage, open or read student/Forms CSV."""
import unittest

from audit_tracked_csv_history import AuditUnavailable, inspect_history, parse_tree_metadata


A = b"a" * 40
B = b"b" * 40
C = b"c" * 40
ONE = b"100644 blob " + A + b"\tcsv/synthetic-first.csv\x00"
SECOND = b"100644 blob " + B + b"\tcsv/synthetic-second.csv\x00"


class HistoricalCsvAuditTests(unittest.TestCase):
    def test_empty_or_duplicate_entries_in_local_commits_are_aggregated_only(self):
        calls = []
        def run(args):
            calls.append(args)
            if args[0] == "rev-parse":
                return b"false\n"
            if args[0] == "rev-list":
                return A + b"\n" + B + b"\n" + C + b"\n"
            return {A.decode(): ONE + SECOND, B.decode(): ONE + SECOND,
                    C.decode(): ONE.replace(A, B)}[args[3]]
        result = inspect_history(run)
        self.assertEqual(result["commits_scanned"], 3)
        self.assertEqual(result["commits_containing_csv"], 3)
        self.assertEqual(result["distinct_csv_blob_versions"], 2)
        self.assertEqual(result["max_csv_files_in_one_commit"], 2)
        self.assertEqual(result["owner_publication_rights_and_consent"], "NOT_VERIFIED")
        self.assertEqual(result["external_forks_and_unfetched_refs"], "UNKNOWN")
        self.assertNotIn("synthetic-first", str(result))
        self.assertTrue(all(args[0] in ("rev-parse", "rev-list", "ls-tree") for args in calls))
        self.assertTrue(all(args[0] != "ls-tree" or args[-1] == "csv/" for args in calls))

    def test_no_history_is_never_reported_clean(self):
        def run(args):
            return b"false\n" if args[0] == "rev-parse" else b""
        with self.assertRaises(AuditUnavailable):
            inspect_history(run)

    def test_shallow_repository_fails_closed(self):
        with self.assertRaises(AuditUnavailable):
            inspect_history(lambda args: b"true\n")

    def test_tree_contains_only_regular_blob_metadata_under_csv(self):
        for bad in (b"100644 blob " + A + b"\tprivate/name\x00",
                    b"120000 blob " + A + b"\tcsv/link\x00",
                    b"100644 commit " + A + b"\tcsv/submodule\x00",
                    b"corrupt\x00",
                    b"100644 blob " + b"x" * 40 + b"\tcsv/bad\x00"):
            with self.subTest(bad=bad[:8]), self.assertRaises(AuditUnavailable):
                parse_tree_metadata(bad)

    def test_no_matching_csv_returns_conservative_scope_not_approval(self):
        def run(args):
            if args[0] == "rev-parse":
                return b"false"
            if args[0] == "rev-list":
                return A + b"\n"
            return b""
        report = inspect_history(run)
        self.assertEqual(report["state"], "NO_CSV_IN_FETCHED_LOCAL_REFS")
        self.assertEqual(report["owner_publication_rights_and_consent"], "NOT_VERIFIED")


if __name__ == "__main__":
    unittest.main()
