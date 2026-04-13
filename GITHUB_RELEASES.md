# Guia de Publicação e Atualizações do GameEngine3D

## 📦 Como Publicar Atualizações

O GameEngine3D suporta três métodos de publicação de atualizações automáticas:

### 1️⃣ GitHub Releases (Recomendado - Grátis e Fácil)

#### Pré-requisitos:
1. Instale o GitHub CLI: https://cli.github.com/
2. Faça login com `gh auth login`
3. Seu repositório deve estar em GitHub

#### Passo a passo:

```bash
# 1. Atualize a versão no package.json
# Exemplo: "version": "1.0.1"

# 2. Compile o app
npm run build:app

# 3. Publique no GitHub Releases
npm run publish:github -- --tag v1.0.1 --release-notes "Correções de bugs e melhorias"
```

O app baixará automaticamente as atualizações de `https://github.com/seu-usuario/seu-repo/releases/`

#### Configuração automática:
Se você publicar no GitHub Releases, atualize `package.json`:

```json
"publish": [
  {
    "provider": "github",
    "owner": "seu-usuario",
    "repo": "GAME-ENGINE3D"
  }
]
```

---

### 2️⃣ Servidor Genérico (Qualquer HTTP)

Use este método se tiver seu próprio servidor HTTP.

#### Passo a passo:

```bash
# 1. Compile o app
npm run build:app

# 2. Prepare os arquivos para publicação
npm run publish:generic -- --url https://seu-servidor.com/updates/

# 3. Copie os arquivos gerados para seu servidor:
#    - dist/GameEngine3D Editor-1.0.1-win-x64.exe
#    - dist/latest.yml
#    
#    Coloque em: https://seu-servidor.com/updates/
```

#### Configuração:
Atualize `package.json`:

```json
"publish": [
  {
    "provider": "generic",
    "url": "https://seu-servidor.com/updates/"
  }
]
```

---

### 3️⃣ Servidor Local (Para Testes)

Use para testar atualizações em desenvolvimento.

#### Passo a passo:

```bash
# 1. Compile o app
npm run build:app

# 2. Inicie o servidor local
npm run publish:local

# 3. Execute o app com a URL do servidor local
set UPDATE_SERVER_URL=http://localhost:3000/updates/
npm run start:app
```

O app verificará atualizações em `http://localhost:3000/updates/`

---

## 🔄 Fluxo Completo de Atualização

### Para o Desenvolvedor:

1. **Fazer mudanças no código**
   ```bash
   git add .
   git commit -m "Novas features e correções"
   ```

2. **Atualizar versão** (package.json)
   ```json
   "version": "1.0.1"
   ```

3. **Compilar o app**
   ```bash
   npm run build:app
   ```

4. **Publicar (escolha um método)**
   
   **GitHub Releases:**
   ```bash
   npm run publish:github -- --tag v1.0.1 --release-notes "Novas features e correções"
   ```
   
   **Ou servidor próprio:**
   ```bash
   npm run publish:generic -- --url https://seu-servidor.com/updates/
   # Depois copie os arquivos para seu servidor
   ```

### Para o Usuário Final:

1. App verificará atualizações automaticamente ao iniciar
2. Se houver nova versão disponível:
   - App baixará a atualização em background
   - Ao terminar, mostrará um popup: "Deseja reiniciar agora para instalar?"
   - Usuário clica "Reiniciar agora"
   - App reinstala e reinicia automaticamente

---

## 🛠️ Configuração Avançada

### Variáveis de Ambiente

Para testar ou forçar um servidor específico:

```bash
# Windows PowerShell:
$env:UPDATE_SERVER_URL="http://localhost:3000/updates/"
npm run start:app

# Windows CMD:
set UPDATE_SERVER_URL=http://localhost:3000/updates/
npm run start:app
```

### Arquivo latest.yml

Este arquivo é gerado automaticamente e contém metadados da atualização:

```yaml
version: 1.0.1
files:
  - url: GameEngine3D Editor-1.0.1-win-x64.exe
    sha256: abcd1234...
    size: 102592723
releaseDate: '2026-04-13T17:00:00.000Z'
```

---

## ⚠️ Troubleshooting

### "PHP não encontrado"
- Defina `PHP_PATH=C:\MAMP\bin\php\php7.3.19\php.exe` nas variáveis de ambiente do Windows
- Ou instale PHP e adicione ao PATH do sistema

### "Atualização não está funcionando"
1. Verifique se a URL está correta: `echo %UPDATE_SERVER_URL%`
2. Teste a URL no navegador: `http://localhost:3000/updates/latest.yml`
3. Verifique os logs do console do app

### "GitHub CLI não instalado"
```bash
# Windows (com Chocolatey):
choco install gh

# Ou baixe em: https://cli.github.com/
```

---

## 📝 Exemplos Completos

### Exemplo 1: Publicar atualização no GitHub

```bash
# Atualizar versão
# Editar package.json: "version": "1.0.1"

npm run build:app
npm run publish:github -- --tag v1.0.1 --release-notes "Novo editor de cenas e correções de bugs"
```

### Exemplo 2: Testar com servidor local

```bash
# Terminal 1: Servidor local
npm run publish:local

# Terminal 2: Rodar o app
set UPDATE_SERVER_URL=http://localhost:3000/updates/
npm run start:app
```

### Exemplo 3: Publicar em servidor próprio

```bash
# Compile
npm run build:app

# Prepare os arquivos
npm run publish:generic -- --url https://meu-servidor.com/gameengine3d/updates/

# Copie para seu servidor (via FTP, SCP, etc):
# scp dist/GameEngine3D*.exe user@servidor:/var/www/gameengine3d/updates/
# scp dist/latest.yml user@servidor:/var/www/gameengine3d/updates/
```

---

## 🚀 Deploy Contínuo (CI/CD)

Se usar GitHub Actions, adicione este workflow (`.github/workflows/publish.yml`):

```yaml
name: Build and Publish

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm install
      - run: npm run build:app
      
      - name: Publish Release
        run: npm run publish:github -- --tag ${{ github.ref_name }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

**Dúvidas?** Consulte a documentação do `electron-updater`: https://github.com/electron-userland/electron-builder/wiki/Auto-Update
