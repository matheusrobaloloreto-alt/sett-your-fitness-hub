#!/usr/bin/env python3
import csv
import importlib.util
import json
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location(
    "recording_material_generator",
    ROOT / "scripts/gerar-material-gravacao.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

FIELDS = [
    "codigo", "arquivo_final", "nome_exercicio", "grupo_muscular", "estacao",
    "prioridade", "video_referencia", "como_executar",
]
MAP = {
    "001": {"id": "11111111-1111-4111-8111-111111111111", "nome": "Vivo A"},
    "002": {"id": "22222222-2222-4222-8222-222222222222", "nome": "Ausente"},
    "003": {"id": "33333333-3333-4333-8333-333333333333", "nome": "Vivo B"},
}


def row(code):
    item = MAP[code]
    return {
        "codigo": code,
        "arquivo_final": f"{code}.mp4",
        "nome_exercicio": item["nome"],
        "grupo_muscular": "teste",
        "estacao": "Teste",
        "prioridade": "normal",
        "video_referencia": "",
        "como_executar": "",
    }


def write_csv(path, fields, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def fixture(root, omit_public_stale=False):
    out = root / "docs"
    public = root / "public"
    edge = root / "allowlist.json"
    out.mkdir()
    public.mkdir()
    edge.write_text(json.dumps(MAP), encoding="utf-8")
    (out / "codigo-para-exercicio.json").write_text(json.dumps(MAP), encoding="utf-8")

    assignments = {1: ["002"], 2: ["001"], 3: ["003"]}
    complete = []
    for model, codes in assignments.items():
        rows = [row(code) for code in codes]
        write_csv(out / f"shot-list-modelo-{model}.csv", FIELDS, rows)
        for current in rows:
            complete.append({**current, "exercise_id": MAP[current["codigo"]]["id"]})
        body = "".join(
            f'<li data-cod="{code}" data-id="{MAP[code]["id"]}">x</li>' for code in codes
        )
        page = f'<div class="sub">{len(codes)} exercícios · teste</div><ul>{body}</ul>'
        (out / f"gravacao-modelo-{model}.html").write_text(page, encoding="utf-8")
        public_page = page
        if omit_public_stale and model == 1:
            public_page = '<div class="sub">0 exercícios · teste</div><ul></ul>'
        (public / MODULE.PUBLIC_NAMES[model]).write_text(public_page, encoding="utf-8")

    write_csv(out / "shot-list-completo.csv", FIELDS + ["exercise_id"], complete)
    return out, public, edge


def all_bytes(root):
    return {path.relative_to(root): path.read_bytes() for path in root.rglob("*") if path.is_file()}


with tempfile.TemporaryDirectory(prefix="recording-roster-ok-") as tmp:
    root = Path(tmp)
    MODULE.OUT, MODULE.PUBLIC_OUT, MODULE.EDGE_ALLOWLIST = fixture(root)
    stale = [("002", MAP["002"])]
    MODULE.prune_stale_artifacts(MAP, stale, {"002"})

    updated = json.loads((MODULE.OUT / "codigo-para-exercicio.json").read_text(encoding="utf-8"))
    assert list(updated) == ["001", "003"]
    assert json.loads(MODULE.EDGE_ALLOWLIST.read_text(encoding="utf-8")) == updated
    retired = json.loads((MODULE.OUT / "roteiro-retirados.json").read_text(encoding="utf-8"))
    assert retired == [{
        "codigo": "002",
        "id": MAP["002"]["id"],
        "nome": "Ausente",
        "motivo": "exercise_absent_from_live_library",
    }]
    assert 'data-cod="002"' not in (MODULE.OUT / "gravacao-modelo-1.html").read_text()
    assert '<div class="sub">0 exercícios' in (MODULE.OUT / "gravacao-modelo-1.html").read_text()
    snapshot = all_bytes(root)
    MODULE.prune_stale_artifacts(updated, [])
    assert all_bytes(root) == snapshot

with tempfile.TemporaryDirectory(prefix="recording-roster-fail-") as tmp:
    root = Path(tmp)
    MODULE.OUT, MODULE.PUBLIC_OUT, MODULE.EDGE_ALLOWLIST = fixture(root, omit_public_stale=True)
    snapshot = all_bytes(root)
    try:
        MODULE.prune_stale_artifacts(MAP, [("002", MAP["002"])], {"002"})
        raise AssertionError("reconciliação inconsistente deveria falhar")
    except RuntimeError as error:
        assert "HTML público" in str(error)
    assert all_bytes(root) == snapshot

with tempfile.TemporaryDirectory(prefix="recording-roster-confirm-") as tmp:
    root = Path(tmp)
    MODULE.OUT, MODULE.PUBLIC_OUT, MODULE.EDGE_ALLOWLIST = fixture(root)
    snapshot = all_bytes(root)
    try:
        MODULE.prune_stale_artifacts(MAP, [("002", MAP["002"])], {"999"})
        raise AssertionError("lista de confirmação divergente deveria falhar")
    except RuntimeError as error:
        assert "Retirada não confirmada" in str(error)
    assert all_bytes(root) == snapshot

print("recording roster reconcile: success + idempotency + fail-closed verificados")
