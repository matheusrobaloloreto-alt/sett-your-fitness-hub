import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("asaas_audit", Path(__file__).with_name("audit-asaas-export.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditTests(unittest.TestCase):
    def test_blank_identifiers_never_match(self):
        self.assertFalse(any(audit.identity_signals({"Nome": "Outro"}, {"full_name": "Aluno"}).values()))

    def test_normalized_name_is_not_fiscal_confirmation(self):
        signals = audit.identity_signals({"Nome": " ALUNO  SILVA "}, {"full_name": "Aluno Silva"})
        self.assertTrue(signals["name"])
        self.assertFalse(signals["cpf"])

    def test_shared_email_remains_a_separate_signal(self):
        signals = audit.identity_signals({"Nome": "Responsavel", "Email": "x@example.invalid"},
                                         {"full_name": "Aluno", "email_hash": audit.hashlib.md5(b"x@example.invalid").hexdigest()})
        self.assertTrue(signals["email"])
        self.assertFalse(signals["name"])
        self.assertFalse(signals["cpf"])

    def test_date_uses_export_date_not_settlement(self):
        self.assertEqual(audit.iso("16/03/2026"), "2026-03-16")
        self.assertIsNone(audit.iso(""))


if __name__ == "__main__":
    unittest.main()
