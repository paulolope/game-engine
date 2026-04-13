# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

## [1.0.0] - 2026-04-13

### Adicionado
- Suporte a atualização automática via GitHub Releases ou servidor genérico
- Detecção automática de PHP em múltiplos caminhos
- Mensagem de erro clara se o PHP não for encontrado
- Script de publicação de atualizações
- Suporte a `electron-updater` para gerenciamento de atualizações

### Corrigido
- Problema de seleção de objetos no mapa (raycasting)
- Bloqueia ao clicar em helpers invisíveis

### Alterado
- Desabilitado ASAR no empacotamento para permitir acesso aos arquivos PHP
- A versão do Electron agora busca PHP de forma mais robusta

---

## Como Manter este Changelog

Adicione novas seções no topo para cada versão:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Adicionado
- Nova feature 1
- Nova feature 2

### Corrigido
- Bug 1
- Bug 2

### Alterado
- Mudança 1
- Mudança 2

### Removido
- Feature removida 1
```

Use [Semantic Versioning](https://semver.org/):
- **MAJOR** (X.0.0): mudanças incompatíveis
- **MINOR** (1.Y.0): novas features compatíveis
- **PATCH** (1.0.Z): correções de bugs

---

## Publicando uma Nova Versão

1. Atualizar `package.json` com nova versão
2. Editar este arquivo com as mudanças
3. Fazer commit: `git commit -am "Release v1.0.1"`
4. Tag: `git tag v1.0.1`
5. Push: `git push origin main --tags`
6. Publicar: `npm run publish:github -- --tag v1.0.1`
