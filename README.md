# Baralhos oraculares

Acervo público de imagens dos baralhos oraculares da Estathi.

As imagens estão organizadas em `baralhos/<nome-do-baralho>/`, preservando uma
URL pública e estável para cada carta:

- `baralhos/runas/`: 24 imagens;
- `baralhos/cartas-sakura/`: 52 imagens.
- `baralhos/tarot/`: 78 imagens;
- `baralhos/os70/`: 70 imagens;
- `baralhos/cigano/`: 36 imagens;
- `baralhos/tommie-kelly/`: 40 imagens.

O arquivo [`baralhos/manifest.csv`](baralhos/manifest.csv) relaciona cada célula
da planilha ao nome da carta, à URL de origem, ao arquivo local e à nova URL
pública. Os novos arquivos seguem o padrão `NN-nome-da-carta.ext`.

O código da API temporária usada para migrar os links da planilha está em
[`apps-script/`](apps-script/).

O script [`scripts/prepare_migration.py`](scripts/prepare_migration.py) baixa e
valida as imagens da exportação, corrige extensões conforme o tipo MIME e prepara
o lote de atualização das células. Ele percorre automaticamente todas as colunas
de baralhos e ignora links que já apontam para este repositório.

Os catálogos usados para nomear Tarot, Os70 e Cigano estão em
[`data/card_names.json`](data/card_names.json). O PDF de referência do Os70 está
em [`data/os70.pdf`](data/os70.pdf).
