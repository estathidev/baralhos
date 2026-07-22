#!/usr/bin/env python3
"""Baixa as imagens exportadas do Apps Script e prepara a troca de URLs."""

from __future__ import annotations

import csv
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EXPORT_FILE = ROOT / ".migration" / "oraculares.json"
UPDATES_FILE = ROOT / ".migration" / "updates.json"
DECKS_DIR = ROOT / "baralhos"
MANIFEST_FILE = DECKS_DIR / "manifest.csv"
RAW_BASE = "https://raw.githubusercontent.com/estathidev/baralhos/main/"
USER_AGENT = "estathidev-baralhos-migration/1.0"
CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")


def filename_from_url(url: str, cell: str) -> str:
    path = urllib.parse.unquote(urllib.parse.urlsplit(url).path)
    if "/revision/" in path:
        path = path.split("/revision/", 1)[0]
    filename = Path(path).name
    filename = re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip(".-")
    if not filename:
        filename = cell.lower() + ".img"
    if not Path(filename).suffix:
        filename += ".img"
    return filename


def cell_url(cell: dict[str, object]) -> str:
    link = cell.get("link")
    if isinstance(link, str) and link:
        return link
    display = cell.get("display")
    if isinstance(display, str) and display.startswith(("https://", "http://")):
        return display
    raise ValueError(f"A célula {cell.get('a1')} não contém uma URL HTTP.")


def load_records() -> list[dict[str, str]]:
    payload = json.loads(EXPORT_FILE.read_text(encoding="utf-8"))
    if not payload.get("ok"):
        raise RuntimeError("A exportação da planilha contém um erro.")
    data = payload["data"]
    cells = data["cells"]
    first_row = int(data["firstImageRow"])
    first_column = int(data["firstDeckColumn"])
    headers = {
        int(cell["column"]): str(cell["display"]).strip()
        for cell in cells
        if int(cell["row"]) == 1 and int(cell["column"]) >= first_column
    }

    records: list[dict[str, str]] = []
    seen_paths: set[str] = set()
    for cell in cells:
        row = int(cell["row"])
        column = int(cell["column"])
        if row < first_row or column < first_column:
            continue
        deck = headers.get(column)
        if not deck:
            raise ValueError(f"Nome do baralho ausente na coluna {column}.")
        source_url = cell_url(cell)
        filename = filename_from_url(source_url, str(cell["a1"]))
        relative_path = Path("baralhos") / slugify(deck) / filename
        relative_posix = relative_path.as_posix()
        if relative_posix in seen_paths:
            raise ValueError(f"Nome de arquivo duplicado: {relative_posix}")
        seen_paths.add(relative_posix)
        records.append(
            {
                "cell": str(cell["a1"]),
                "deck": deck,
                "source_url": source_url,
                "path": relative_posix,
                "repository_url": RAW_BASE + urllib.parse.quote(relative_posix),
            }
        )
    return records


def download(record: dict[str, str]) -> tuple[dict[str, str], int, str]:
    request = urllib.request.Request(
        record["source_url"],
        headers={"User-Agent": USER_AGENT, "Accept": "image/*"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        content_type = response.headers.get_content_type().lower()
        if not content_type.startswith("image/"):
            raise ValueError(
                f"{record['cell']}: conteúdo inesperado {content_type}"
            )
        content = response.read()
    if len(content) < 100:
        raise ValueError(f"{record['cell']}: imagem vazia ou inválida")

    expected_suffix = CONTENT_TYPE_EXTENSIONS.get(content_type)
    if expected_suffix:
        path = Path(record["path"])
        if path.suffix.lower() != expected_suffix:
            path = path.with_suffix(expected_suffix)
            record["path"] = path.as_posix()
            record["repository_url"] = RAW_BASE + urllib.parse.quote(record["path"])

    destination = ROOT / record["path"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    temporary.write_bytes(content)
    os.replace(temporary, destination)
    return record, len(content), content_type


def main() -> int:
    if not EXPORT_FILE.exists():
        print(f"Exportação ausente: {EXPORT_FILE}", file=sys.stderr)
        return 1

    records = load_records()
    results: dict[str, tuple[int, str]] = {}
    errors: list[str] = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(download, record): record for record in records}
        for future in as_completed(futures):
            record = futures[future]
            try:
                _, size, content_type = future.result()
                results[record["cell"]] = (size, content_type)
            except Exception as error:  # noqa: BLE001 - relatório por célula
                errors.append(f"{record['cell']}: {error}")

    if errors:
        print("Falha ao baixar imagens:", file=sys.stderr)
        for error in sorted(errors):
            print(f"- {error}", file=sys.stderr)
        return 1

    paths = [record["path"] for record in records]
    if len(paths) != len(set(paths)):
        print("A extensão real criou nomes de arquivo duplicados.", file=sys.stderr)
        return 1

    DECKS_DIR.mkdir(parents=True, exist_ok=True)
    with MANIFEST_FILE.open("w", encoding="utf-8", newline="") as handle:
        fieldnames = [
            "cell",
            "deck",
            "path",
            "bytes",
            "content_type",
            "source_url",
            "repository_url",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for record in records:
            size, content_type = results[record["cell"]]
            writer.writerow(
                {
                    **record,
                    "bytes": size,
                    "content_type": content_type,
                }
            )

    updates = {
        "updates": [
            {
                "a1": record["cell"],
                "expected": record["source_url"],
                "value": record["repository_url"],
            }
            for record in records
        ]
    }
    UPDATES_FILE.write_text(
        json.dumps(updates, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    total_bytes = sum(size for size, _ in results.values())
    print(f"Imagens preparadas: {len(records)} ({total_bytes} bytes)")
    print(f"Manifesto: {MANIFEST_FILE.relative_to(ROOT)}")
    print(f"Atualizações: {UPDATES_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
