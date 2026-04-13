const DEFAULT_STATE = {
  query: '',
  cursor: '',
  nextCursor: null,
  previousCursor: null,
  sortBy: '',
  fileFormat: 'auto',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pickFormats(item) {
  const formats = Array.isArray(item?.formats) ? item.formats : [];
  if (!formats.length) return 'sem formatos';
  return formats.join(', ').toUpperCase();
}

function isDirectSketchfabReference(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^[a-f0-9]{32}$/i.test(text)) return true;
  return /sketchfab\.com\/(?:3d-models|models)\//i.test(text) && /[a-f0-9]{32}/i.test(text);
}

function pickAnimationLabel(item) {
  if (!item?.isAnimated) return '';
  const count = Math.max(0, Number(item?.animationCount) || 0);
  return count > 0 ? `Animado (${count})` : 'Animado';
}

function cacheStateLabel(state) {
  if (state === 'cached') return 'Em cache';
  if (state === 'missing') return 'Reimportar';
  return 'Novo';
}

export class SketchfabBrowser {
  constructor({ modalEl, rootEl, closeButton, assetManager, onImported, onClose }) {
    this.modalEl = modalEl;
    this.rootEl = rootEl;
    this.closeButton = closeButton;
    this.assetManager = assetManager;
    this.onImported = onImported;
    this.onClose = onClose;
    this.state = { ...DEFAULT_STATE };
    this.authStatus = null;
    this.rendered = false;
    this.progressTimer = null;
    this.progressValue = 0;
    this.onWindowMessage = (event) => this.handleWindowMessage(event);
    this.onOverlayClick = (event) => {
      if (event.target === this.modalEl) this.close();
    };
  }

  init() {
    if (this.rendered) return;
    this.rootEl.innerHTML = this.template();
    this.cacheDom();
    this.bindEvents();
    this.rendered = true;
  }

  async open() {
    this.init();
    this.stopProgress();
    this.modalEl.classList.remove('hidden');
    await this.refreshAuthStatus();
    await this.search();
    this.searchInput?.focus();
  }

  close() {
    this.stopProgress();
    this.modalEl.classList.add('hidden');
    this.onClose?.();
  }

  isAuthenticated() {
    return !!this.authStatus?.authenticated;
  }

  async refreshAuthStatus() {
    try {
      const payload = await this.assetManager.getSketchfabAuthStatus();
      this.authStatus = payload?.status || null;
      this.renderAuthStatus();
    } catch (error) {
      this.authStatus = null;
      this.showBanner(error?.message || 'Falha ao consultar autenticacao Sketchfab.', 'error');
      this.renderAuthStatus();
    }
  }

  async search(cursor = '') {
    this.init();
    this.state.cursor = cursor || '';
    this.state.query = this.searchInput?.value?.trim() || '';
    this.state.sortBy = this.sortSelect?.value || '';
    this.state.fileFormat = this.formatSelect?.value || 'auto';
    const directReference = isDirectSketchfabReference(this.state.query);

    try {
      this.setResultsLoading(true);
      this.showBanner(
        directReference
          ? 'Carregando modelo informado no Sketchfab...'
          : 'Buscando modelos baixaveis no Sketchfab...',
        'info'
      );
      const payload = await this.assetManager.searchSketchfabModels({
        q: this.state.query,
        cursor: this.state.cursor,
        sortBy: this.state.sortBy,
        fileFormat: this.state.fileFormat,
        count: 12,
      });
      this.state.nextCursor = payload?.cursors?.next || null;
      this.state.previousCursor = payload?.cursors?.previous || null;
      this.renderResults(payload?.results || []);
      this.updatePaginator();
      this.showBanner(`Resultados carregados: ${(payload?.results || []).length}.`, 'success');
    } catch (error) {
      this.renderResults([]);
      this.updatePaginator();
      this.showBanner(error?.message || 'Falha ao buscar modelos do Sketchfab.', 'error');
    } finally {
      this.setResultsLoading(false);
    }
  }

  async importSketchfabModel(modelUid, reimport = false) {
    if (!modelUid) return;
    if (!this.isAuthenticated()) {
      this.showBanner('Faça login com Sketchfab antes de importar.', 'error');
      return;
    }

    this.startProgress(reimport ? 'Reimportando asset do Sketchfab...' : 'Importando asset do Sketchfab...');
    try {
      const result = await this.assetManager.importSketchfabModel(modelUid, { reimport });
      this.finishProgress(result?.fromCache ? 'Asset reutilizado do cache local.' : 'Asset importado na engine.');
      await this.onImported?.(result);
      await this.search(this.state.cursor);
    } catch (error) {
      this.failProgress(error?.message || 'Falha ao importar asset Sketchfab.');
    }
  }

  template() {
    return `
      <div class="sketchfab-browser-shell">
        <div class="sketchfab-browser-topbar">
          <div>
            <p class="sketchfab-kicker">OAuth 2.0 + Data API v3 + Download API</p>
            <h2>Sketchfab Browser</h2>
          </div>
          <div class="sketchfab-browser-actions">
            <button type="button" class="ghost" data-action="close">Fechar</button>
          </div>
        </div>
        <div class="sketchfab-browser-auth" data-role="auth-card"></div>
        <div class="sketchfab-browser-controls">
          <label>
            <span>Busca</span>
            <input type="text" data-role="search-input" placeholder="Ex.: boar, stag ou cole URL/UID do modelo" />
          </label>
          <label>
            <span>Ordenar</span>
            <select data-role="sort-select">
              <option value="">Relevancia</option>
              <option value="-publishedAt">Mais novos</option>
              <option value="-likeCount">Mais curtidos</option>
              <option value="-viewCount">Mais vistos</option>
            </select>
          </label>
          <label>
            <span>Formato</span>
            <select data-role="format-select">
              <option value="auto">Auto (GLB/glTF)</option>
              <option value="glb">GLB</option>
              <option value="gltf">glTF</option>
            </select>
          </label>
          <button type="button" class="primary" data-action="search">Buscar</button>
        </div>
        <div class="sketchfab-browser-status" data-role="banner"></div>
        <div class="sketchfab-browser-progress" data-role="progress-wrap" hidden>
          <div class="sketchfab-browser-progress-label" data-role="progress-label">Preparando...</div>
          <div class="sketchfab-browser-progress-track"><div class="sketchfab-browser-progress-fill" data-role="progress-fill"></div></div>
        </div>
        <div class="sketchfab-browser-results" data-role="results"></div>
        <div class="sketchfab-browser-pagination">
          <button type="button" class="ghost" data-action="previous">Anterior</button>
          <button type="button" class="ghost" data-action="next">Proximo</button>
        </div>
      </div>
    `;
  }

  cacheDom() {
    this.searchInput = this.rootEl.querySelector('[data-role="search-input"]');
    this.sortSelect = this.rootEl.querySelector('[data-role="sort-select"]');
    this.formatSelect = this.rootEl.querySelector('[data-role="format-select"]');
    this.bannerEl = this.rootEl.querySelector('[data-role="banner"]');
    this.resultsEl = this.rootEl.querySelector('[data-role="results"]');
    this.authCardEl = this.rootEl.querySelector('[data-role="auth-card"]');
    this.progressWrapEl = this.rootEl.querySelector('[data-role="progress-wrap"]');
    this.progressLabelEl = this.rootEl.querySelector('[data-role="progress-label"]');
    this.progressFillEl = this.rootEl.querySelector('[data-role="progress-fill"]');
    this.prevButton = this.rootEl.querySelector('[data-action="previous"]');
    this.nextButton = this.rootEl.querySelector('[data-action="next"]');
  }

  bindEvents() {
    this.closeButton?.addEventListener('click', () => this.close());
    this.rootEl.querySelector('[data-action="close"]')?.addEventListener('click', () => this.close());
    this.rootEl.querySelector('[data-action="search"]')?.addEventListener('click', () => this.search());
    this.searchInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.search();
      }
    });
    this.prevButton?.addEventListener('click', () => {
      if (this.state.previousCursor) this.search(this.state.previousCursor);
    });
    this.nextButton?.addEventListener('click', () => {
      if (this.state.nextCursor) this.search(this.state.nextCursor);
    });
    window.addEventListener('message', this.onWindowMessage);
    this.modalEl?.addEventListener('click', this.onOverlayClick);
  }

  renderAuthStatus() {
    const status = this.authStatus;
    if (!this.authCardEl) return;

    if (!status?.configured) {
      this.authCardEl.innerHTML = `
        <div class="sketchfab-auth-copy">
          <strong>Sketchfab nao configurado</strong>
          <span>Defina SKETCHFAB_API_TOKEN ou configure CLIENT ID, CLIENT SECRET e REDIRECT URI no arquivo .env.</span>
        </div>
      `;
      return;
    }

    if (status?.authMode === 'api_token') {
      const userName = escapeHtml(status?.user?.displayName || status?.user?.username || 'Token configurado no backend');
      this.authCardEl.innerHTML = `
        <div class="sketchfab-auth-copy">
          <strong>Sketchfab via API Token</strong>
          <span>${userName}</span>
        </div>
      `;
      return;
    }

    const userName = escapeHtml(status?.user?.displayName || status?.user?.username || 'Conta conectada');
    const stateText = status?.authenticated ? `Conectado como ${userName}` : 'Login necessario para importar';
    const actionLabel = status?.authenticated ? 'Sair' : 'Login com Sketchfab';
    this.authCardEl.innerHTML = `
      <div class="sketchfab-auth-copy">
        <strong>${stateText}</strong>
        <span>${escapeHtml(status?.redirectUri || '')}</span>
      </div>
      <div class="sketchfab-auth-actions">
        <button type="button" class="${status?.authenticated ? 'ghost' : 'primary'}" data-action="auth-toggle">${actionLabel}</button>
      </div>
    `;

    this.authCardEl.querySelector('[data-action="auth-toggle"]')?.addEventListener('click', async () => {
      if (status?.loginAvailable === false) {
        this.showBanner('Este projeto esta configurado por API token no backend.', 'info');
        return;
      }
      if (status?.authenticated) {
        await this.assetManager.logoutSketchfab();
        await this.refreshAuthStatus();
        return;
      }
      const popup = window.open('api/sketchfab_auth_start.php', 'sketchfab_oauth', 'width=720,height=840');
      if (!popup) {
        this.showBanner('O navegador bloqueou o popup de login do Sketchfab.', 'error');
      }
    });
  }

  renderResults(results) {
    if (!this.resultsEl) return;
    if (!Array.isArray(results) || !results.length) {
      this.resultsEl.innerHTML = '<div class="sketchfab-empty">Nenhum modelo encontrado para os filtros atuais.</div>';
      return;
    }

    this.resultsEl.innerHTML = results.map((item) => {
      const title = escapeHtml(item.title);
      const author = escapeHtml(item.authorName || 'Autor desconhecido');
      const license = escapeHtml(item.licenseName || 'Licenca desconhecida');
      const thumb = escapeHtml(item.thumbnailUrl || '');
      const formats = escapeHtml(pickFormats(item));
      const animationLabel = escapeHtml(pickAnimationLabel(item));
      const sourceUrl = escapeHtml(item.sourceUrl || '#');
      const buttonLabel = item.cacheState === 'cached' ? 'Reimportar' : 'Importar';
      const cacheLabel = escapeHtml(cacheStateLabel(item.cacheState));
      const recordPath = escapeHtml(item.localRecord?.localFilePath || '');
      return `
        <article class="sketchfab-card" data-model-uid="${escapeHtml(item.modelUid)}">
          <div class="sketchfab-card-media">${thumb ? `<img src="${thumb}" alt="${title}" loading="lazy" />` : '<div class="sketchfab-card-placeholder">Sem thumbnail</div>'}</div>
          <div class="sketchfab-card-body">
            <div class="sketchfab-card-head">
              <div>
                <h3>${title}</h3>
                <p>${author}</p>
              </div>
              <div class="sketchfab-card-flags">
                <span class="sketchfab-chip">${cacheLabel}</span>
                ${animationLabel ? `<span class="sketchfab-chip is-animated">${animationLabel}</span>` : ''}
              </div>
            </div>
            <p class="sketchfab-card-license">Licenca: ${license}</p>
            <p class="sketchfab-card-license">Formatos: ${formats}</p>
            ${recordPath ? `<p class="sketchfab-card-path">Local: ${recordPath}</p>` : ''}
            <div class="sketchfab-card-actions">
              <button type="button" class="primary" data-action="import">${buttonLabel}</button>
              <a href="${sourceUrl}" target="_blank" rel="noopener">Abrir no Sketchfab</a>
            </div>
          </div>
        </article>
      `;
    }).join('');

    this.resultsEl.querySelectorAll('[data-action="import"]').forEach((button) => {
      button.addEventListener('click', () => {
        const card = button.closest('[data-model-uid]');
        const modelUid = card?.getAttribute('data-model-uid') || '';
        const reimport = button.textContent.includes('Reimportar');
        this.importSketchfabModel(modelUid, reimport);
      });
    });
  }

  updatePaginator() {
    if (this.prevButton) this.prevButton.disabled = !this.state.previousCursor;
    if (this.nextButton) this.nextButton.disabled = !this.state.nextCursor;
  }

  setResultsLoading(isLoading) {
    if (!this.resultsEl) return;
    this.resultsEl.classList.toggle('is-loading', !!isLoading);
    if (isLoading) {
      this.resultsEl.innerHTML = '<div class="sketchfab-empty">Carregando resultados do Sketchfab...</div>';
    }
  }

  showBanner(message, kind = 'info') {
    if (!this.bannerEl) return;
    this.bannerEl.textContent = message || '';
    this.bannerEl.dataset.kind = kind;
  }

  startProgress(label) {
    if (!this.progressWrapEl || !this.progressFillEl || !this.progressLabelEl) return;
    this.stopProgress();
    this.progressWrapEl.hidden = false;
    this.progressFillEl.classList.remove('is-error');
    this.progressValue = 8;
    this.progressLabelEl.textContent = label;
    this.progressFillEl.style.width = `${this.progressValue}%`;
    this.progressTimer = window.setInterval(() => {
      this.progressValue = Math.min(92, this.progressValue + 7);
      this.progressFillEl.style.width = `${this.progressValue}%`;
    }, 350);
  }

  finishProgress(label) {
    if (!this.progressWrapEl || !this.progressFillEl || !this.progressLabelEl) return;
    this.stopProgress();
    this.progressWrapEl.hidden = false;
    this.progressLabelEl.textContent = label;
    this.progressFillEl.style.width = '100%';
    window.setTimeout(() => {
      if (this.progressWrapEl) this.progressWrapEl.hidden = true;
    }, 1200);
  }

  failProgress(label) {
    this.stopProgress();
    if (!this.progressWrapEl || !this.progressFillEl || !this.progressLabelEl) return;
    this.progressWrapEl.hidden = false;
    this.progressLabelEl.textContent = label;
    this.progressFillEl.style.width = '100%';
    this.progressFillEl.classList.add('is-error');
    window.setTimeout(() => {
      this.progressFillEl?.classList.remove('is-error');
      if (this.progressWrapEl) this.progressWrapEl.hidden = true;
    }, 2000);
  }

  stopProgress() {
    if (this.progressTimer) {
      window.clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
    if (this.progressWrapEl) this.progressWrapEl.hidden = true;
    if (this.progressFillEl) {
      this.progressFillEl.style.width = '0';
      this.progressFillEl.classList.remove('is-error');
    }
    if (this.progressLabelEl) {
      this.progressLabelEl.textContent = 'Preparando...';
    }
  }

  async handleWindowMessage(event) {
    if (event.origin !== window.location.origin) return;
    if (event.data?.source !== 'sketchfab-oauth') return;
    if (event.data?.ok) {
      this.showBanner('Login com Sketchfab concluido.', 'success');
      await this.refreshAuthStatus();
      return;
    }
    this.showBanner(event.data?.error || 'Falha no login com Sketchfab.', 'error');
  }
}
