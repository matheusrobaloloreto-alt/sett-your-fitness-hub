"""Read-only reconciliation of an Asaas XLSX export against a private scope JSON."""
import argparse
import collections
import hashlib
import json
import re
import unicodedata
from datetime import datetime
from pathlib import Path

import openpyxl


def normalize(value):
    return " ".join("".join(c for c in unicodedata.normalize("NFD", value or "")
                            if unicodedata.category(c) != "Mn").lower().split())


def iso(value):
    return datetime.strptime(value, "%d/%m/%Y").date().isoformat() if value else None


def identity_signals(row, student):
    cpf = re.sub(r"\D", "", str(row.get("CPF ou CNPJ") or ""))
    email = (row.get("Email") or "").strip().lower()
    cpf_hash = hashlib.md5(cpf.encode()).hexdigest() if cpf else None
    email_hash = hashlib.md5(email.encode()).hexdigest() if email else None
    return {"name": normalize(row.get("Nome")) == normalize(student["full_name"]),
            "cpf": bool(cpf_hash and cpf_hash == student.get("cpf_hash")),
            "billing_cpf": bool(cpf_hash and cpf_hash == student.get("billing_cpf_hash")),
            "email": bool(email_hash and email_hash == student.get("email_hash"))}


def reconcile(export_path, scope):
    workbook = openpyxl.load_workbook(export_path, read_only=True, data_only=True)
    sheet = workbook.active
    # Asaas exports can declare A1 as their dimension despite hundreds of rows.
    sheet.reset_dimensions()
    values = iter(sheet.values)
    header = next(values)
    rows = [dict(zip(header, row)) for row in values]
    result = []
    for student in scope:
        matched = [r for r in rows if any(identity_signals(r, student).values())]
        groups = collections.defaultdict(list)
        for row in matched:
            description = row.get("Descri\u00e7\u00e3o") or ""
            match = re.match(r"Parcela (\d+) de (\d+)\.\s*", description)
            key = (iso(row.get("Data de cria\u00e7\u00e3o")), row.get("Forma de pagamento"),
                   row.get("Tipo de cobran\u00e7a"), re.sub(r"^Parcela \d+ de \d+\.\s*", "", description))
            groups[key].append((row, match))
        purchases = []
        for (created, method, kind, description), items in sorted(groups.items(), reverse=True):
            numbers = [int(m.group(1)) for _, m in items if m]
            counts = {int(m.group(2)) for _, m in items if m}
            external = {r.get("Identificador externo") for r, _ in items if r.get("Identificador externo")}
            statuses = dict(collections.Counter(r.get("Situa\u00e7\u00e3o") for r, _ in items))
            installment_group_complete = (len(counts) == 1 and len(numbers) == len(set(numbers))
                                          and sorted(numbers) == list(range(1, next(iter(counts)) + 1)))
            purchases.append({
                "created": created, "method": method, "kind": kind, "description": description,
                "rows": len(items), "sum": round(sum(float(r.get("Valor") or 0) for r, _ in items), 2),
                "installments": sorted(counts), "installment_group_complete": installment_group_complete,
                "statuses": statuses,
                "confirmation_dates": sorted({iso(r.get("Data de confirma\u00e7\u00e3o")) for r, _ in items
                                               if r.get("Data de confirma\u00e7\u00e3o")}),
                "first_due": min(iso(r["Vencimento"]) for r, _ in items),
                "last_due": max(iso(r["Vencimento"]) for r, _ in items),
                "latest_settlement": max([iso(r.get("Data de Pagamento")) for r, _ in items
                                          if r.get("Data de Pagamento")] or [None]),
                "external_student_match": student["student_id"] in external,
                "external_other_present": any(x != student["student_id"] for x in external),
                "identity_signals": {key: sum(identity_signals(r, student)[key] for r, _ in items)
                                     for key in ("name", "cpf", "billing_cpf", "email")},
            })
        result.append({"ref": student["ref"], "matched_rows": len(matched), "purchases": purchases})
    workbook.close()
    return {"source_sha256": hashlib.sha256(Path(export_path).read_bytes()).hexdigest(),
            "source_rows": len(rows), "scope_rows": len(scope), "results": result}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export")
    parser.add_argument("scope", help="Private JSON with ref, student_id, full_name; never commit this input")
    args = parser.parse_args()
    print(json.dumps(reconcile(args.export, json.loads(Path(args.scope).read_text())), ensure_ascii=False))
