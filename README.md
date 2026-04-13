# Game Engine 3D

Engine web 3D em PHP + JavaScript com editor visual, preview em navegador e importacao local de assets. Esta versao inclui um browser completo do Sketchfab vinculado ao botao **Asset Store** do editor.

## Sketchfab Browser

A integracao segue os docs oficiais atuais do Sketchfab:
- Busca e listagem via Data API v3.
- Login via OAuth 2.0 Authorization Code.
- Download via `GET /v3/models/{uid}/download`.
- Cache local para evitar downloads repetidos.
- Registro local de metadados do asset importado.
- Importacao priorizando GLB quando o Download API devolver GLB; se vier ZIP glTF, a engine extrai automaticamente e tenta converter para GLB local. Se a conversao nao estiver disponivel, importa o `scene.gltf` com a pasta extraida.

## Requisitos

- MAMP ou outro Apache/PHP compatível.
- PHP 7.3+ com `zip` habilitado.
- Node.js 24+.
- NPM 11+.
- Uma aplicacao Sketchfab registrada com Client ID e Client Secret.

## Como rodar

1. Instale as dependencias Node usadas na conversao glTF -> GLB:
   - `npm install`
2. Copie o exemplo de ambiente:
   - `copy .env.example .env`
3. Edite o `.env` com suas credenciais do Sketchfab.
4. Inicie o Apache do MAMP.
5. Abra o editor:
   - [http://localhost/GAME-ENGINE3D/](http://localhost/GAME-ENGINE3D/)

## Executando como aplicativo Windows
1. Instale as dependências Node:
   - `npm install`
2. Inicie o app Electron com servidor PHP:
   - `npm run start:app`
3. Para gerar um instalador `.exe`:
   - `npm run build:app`

### 🚀 Atualizações Automáticas

O app suporta três métodos de publicação de atualizações:

#### **GitHub Releases** (Recomendado)
```bash
# 1. Configure seu repositório GitHub
npm run setup:github

# 2. Compile
npm run build:app

# 3. Publique
npm run publish:github -- --tag v1.0.1 --release-notes "Novas features"
```

#### **Servidor Próprio**
```bash
# Prepare os arquivos
npm run publish:generic -- --url https://seu-servidor.com/updates/

# Copie os arquivos para seu servidor
```

#### **Servidor Local** (para testes)
```bash
# Terminal 1: Servidor local
npm run publish:local

# Terminal 2: Execute o app
set UPDATE_SERVER_URL=http://localhost:3000/updates/
npm run start:app
```

📖 **Guia completo**: Veja [GITHUB_RELEASES.md](GITHUB_RELEASES.md)

> **Observação:** O PHP deve estar disponível no PATH do sistema ou defina `PHP_PATH`.

## Onde inserir as credenciais do Sketchfab

As credenciais ficam no arquivo `.env` na raiz do projeto.

Exemplo:

```env
SKETCHFAB_CLIENT_ID=your_sketchfab_client_id
SKETCHFAB_CLIENT_SECRET=your_sketchfab_client_secret
SKETCHFAB_REDIRECT_URI=http://localhost/GAME-ENGINE3D/api/sketchfab_auth_callback.php
SKETCHFAB_AUTHORIZE_URL=https://sketchfab.com/oauth2/authorize/
SKETCHFAB_TOKEN_URL=https://sketchfab.com/oauth2/token/
SKETCHFAB_API_BASE_URL=https://api.sketchfab.com/v3
SKETCHFAB_SEARCH_COUNT=12
```

Observacoes:
- O `SKETCHFAB_REDIRECT_URI` precisa ser o mesmo URI registrado no app do Sketchfab.
- Segundo a documentacao oficial do Sketchfab, o Client ID e o Client Secret sao liberados apos registrar o app junto ao suporte/desenvolvedores do Sketchfab.

## Como usar no editor

1. Abra o editor em [http://localhost/GAME-ENGINE3D/](http://localhost/GAME-ENGINE3D/).
2. Clique em **Asset Store** na barra superior do viewport.
3. Na janela **Sketchfab Browser**, clique em **Login com Sketchfab**.
4. Autorize a aplicacao no popup OAuth.
5. Use a busca textual e mantenha o filtro de assets baixaveis.
6. Clique em **Importar**.
7. O asset sera salvo em `assets/models/sketchfab` e registrado em `data/sketchfab_asset_registry.json`.
8. Depois disso ele aparece normalmente no painel de assets do projeto.

## Exemplo funcional de modelo para testar

UID real de teste:
- `9d01f4bba4ba45088a21aac2ee134d5f`

Modelo publico usado como referencia:
- `Bronze Stag`

Fluxo sugerido de teste:
1. Buscar `Bronze Stag` ou colar `stag` na busca.
2. Entrar com uma conta Sketchfab que tenha permissao de download.
3. Importar o asset.
4. Conferir o arquivo criado em `assets/models/sketchfab`.
5. Conferir o registro em `data/sketchfab_asset_registry.json`.

## Estrutura principal criada

```text
api/
  sketchfab_bootstrap.php
  sketchfab_auth_start.php
  sketchfab_auth_callback.php
  sketchfab_auth_status.php
  sketchfab_auth_logout.php
  sketchfab_search.php
  sketchfab_import.php
modules/
  sketchfab_auth/
    SketchfabConfig.php
    SketchfabAuthService.php
  sketchfab_api/
    SketchfabApiException.php
    SketchfabHttpClient.php
    SketchfabApiService.php
  sketchfab_download/
    SketchfabImportService.php
  sketchfab_cache/
    SketchfabCache.php
  glb_importer/
    GlbImporter.php
  asset_registry/
    AssetRegistry.php
  ui_asset_browser/
    SketchfabBrowser.js
tests/
  auth/
    SketchfabAuthServiceTest.php
  api/
    SketchfabApiSearchTest.php
  download/
    SketchfabDownloadServiceTest.php
    ZipExtractorTest.php
  import/
    GlbImporterTest.php
  bootstrap.php
  run.php
.env.example
package.json
```

## Endpoints locais da integracao

- `GET api/sketchfab_auth_status.php`
- `POST api/sketchfab_auth_logout.php`
- `GET api/sketchfab_auth_start.php`
- `GET api/sketchfab_auth_callback.php`
- `GET api/sketchfab_search.php?q=stag&file_format=glb`
- `POST api/sketchfab_import.php`

## Cache e registro local

Downloads e extracoes temporarias:
- `data/cache/sketchfab/`

Registro local dos imports:
- `data/sketchfab_asset_registry.json`

Arquivos importados para a engine:
- `assets/models/sketchfab/`

Campos salvos no registro:
- `localId`
- `sketchfabModelUid`
- `title`
- `authorName`
- `licenseName`
- `licenseUrl`
- `sourceUrl`
- `thumbnailUrl`
- `localFilePath`
- `importedAt`
- `hash`
- `cacheKey`
- `importFormat`
- `downloadSourceType`
- `attribution`

## Como rodar os testes

Se o `php` nao estiver no PATH do Windows, use o binario do MAMP:

```powershell
C:/MAMP/bin/php/php7.3.19/php.exe tests/run.php
```

Ou via NPM:

```powershell
npm run test:sketchfab
```

## O que os testes cobrem

- Auth tests: URL OAuth, callback, persistencia e refresh de token.
- API search tests: parametros oficiais da busca e normalizacao de resultados.
- Download tests: fluxo de importacao com download direto de GLB.
- Unzip tests: extracao automatica de ZIP glTF.
- GLB import tests: copia/importacao do arquivo local na engine.

## Tratamento de erros implementado

Erros amigaveis foram tratados para:
- falta de login
- token expirado
- app Sketchfab nao configurado
- asset sem permissao de download
- falha HTTP
- arquivo vazio ou corrompido
- ZIP sem `.glb` e sem `.gltf`
- falha de importacao para a engine

## Limitacoes conhecidas

- O Download API oficial do Sketchfab documenta link temporario para `gltf` ZIP e `usdz`; o codigo tambem aceita `glb` se ele vier na resposta, mas isso depende do payload retornado pelo Sketchfab para cada modelo.
- Quando o Sketchfab devolver apenas glTF ZIP, a engine tenta converter para GLB usando `@gltf-transform/cli`. Se esse binario nao estiver instalado, o fallback sera importar o `scene.gltf` com os assets extraidos.
- Assets protegidos, privados ou sem permissao de download continuam bloqueados pela politica do Sketchfab.

## Arquivos principais da UI

- `index.php`: adiciona o modal do Sketchfab Browser.
- `js/editor/EditorApp.js`: abre o browser ao clicar em **Asset Store**.
- `js/assets/AssetManager.js`: encapsula auth, busca e importacao do Sketchfab.
- `modules/ui_asset_browser/SketchfabBrowser.js`: UI funcional com busca, login, cards, status e importacao.

## Fluxo resumido de importacao

1. Usuario clica em **Asset Store**.
2. Faz login via OAuth 2.0.
3. Busca modelos com `downloadable=true` e `file_format=glb`.
4. Escolhe um resultado e clica em **Importar**.
5. A engine pede o download na API oficial do Sketchfab.
6. Baixa o arquivo.
7. Se vier ZIP, extrai automaticamente.
8. Localiza `.glb` ou `.gltf`.
9. Importa para `assets/models/sketchfab`.
10. Registra metadados em `data/sketchfab_asset_registry.json`.
