# Baralhos oraculares

Acervo público de imagens dos baralhos oraculares da Estathi.

As imagens estão organizadas em `baralhos/<nome-do-baralho>/`, preservando uma
URL pública e estável para cada carta:

- `baralhos/runas/`: 24 imagens;
- `baralhos/cartas-sakura/`: 52 imagens.

O arquivo [`baralhos/manifest.csv`](baralhos/manifest.csv) relaciona cada célula
da planilha à URL de origem, ao arquivo local e à nova URL pública.

O código da API temporária usada para migrar os links da planilha está em
[`apps-script/`](apps-script/).

O script [`scripts/prepare_migration.py`](scripts/prepare_migration.py) baixa e
valida as imagens da exportação, corrige extensões conforme o tipo MIME e prepara
o lote de atualização das células.
