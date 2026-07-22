# API do Google Apps Script

Esta API temporária permite ler a aba `Oraculares` e substituir links somente na
área de imagens (`B5` em diante). Todas as colunas preenchidas são descobertas
automaticamente, inclusive novos baralhos adicionados no futuro. Novos valores são limitados às URLs públicas do
repositório `estathidev/baralhos`.

## Instalação na planilha

1. Abra a planilha e escolha **Extensões > Apps Script**.
2. Substitua o conteúdo de `Code.gs` pelo conteúdo deste diretório.
3. Em **Configurações do projeto**, marque a opção para mostrar o arquivo de
   manifesto e substitua `appsscript.json` pelo arquivo deste diretório.
4. No editor, selecione `createApiToken` e clique em **Executar**. Autorize o
   acesso à planilha. Copie o token exibido no registro de execução.
5. Escolha **Implantar > Nova implantação > App da Web**:
   - Executar como: **você**;
   - Quem pode acessar: **qualquer pessoa**;
   - clique em **Implantar** e copie a URL terminada em `/exec`.

Envie a URL `/exec` e o token temporário ao operador por um canal privado. Nunca
adicione o token a este repositório.

## Encerramento

Depois que a migração for confirmada, execute manualmente `revokeApiToken` e
arquive ou exclua a implantação. Assim, a URL deixa de permitir acesso à
planilha mesmo que o token temporário tenha sido exposto.
