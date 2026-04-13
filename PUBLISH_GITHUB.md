# Publicar Release no GitHub

Seu repositório está configurado em: `https://github.com/paulolope/game-engine`

## 1️⃣ Gerar Personal Access Token

1. Acesse: https://github.com/settings/tokens?type=beta
2. Clique em "Generate new token"
3. Nome: `GameEngine3D Publisher`
4. Escopo (Permissions):
   - ✅ public_repo (ou "repo" se for privado)
5. Clique em "Generate token"
6. **Copie o token** (você não poderá ver novamente!)

## 2️⃣ Publicar Release

### Windows PowerShell:
```powershell
$env:GITHUB_TOKEN="seu_token_aqui"
npm run publish:github:api -- v1.0.0 "Primeira versão com suporte a atualização automática"
```

### Windows CMD:
```cmd
set GITHUB_TOKEN=seu_token_aqui
npm run publish:github:api -- v1.0.0 "Primeira versão com suporte a atualização automática"
```

## 3️⃣ Verificar Release

Acesse: https://github.com/paulolope/game-engine/releases

## 📝 Fluxo Completo

```bash
# 1. Fazer mudanças, testes, etc.
git add .
git commit -m "Novas features"

# 2. Atualizar versão no package.json
# "version": "1.0.1"

# 3. Compilar
npm run build:app

# 4. Subir para GitHub
git tag v1.0.1
git push origin main --tags

# 5. Publicar Release
set GITHUB_TOKEN=seu_token
npm run publish:github:api -- v1.0.1 "Ver package.json para changelog"
```

✅ Pronto! Os usuários receberão a atualização automática ao abrir o app.

---

⚠️ **Importante:** Não compartilhe seu `GITHUB_TOKEN` publicamente. Se vazar, derrube o token em https://github.com/settings/tokens
