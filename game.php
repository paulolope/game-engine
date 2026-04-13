<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Game Preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/game.css?v=20260412a" />
</head>
<body>
  <header id="game-topbar">
    <div class="game-left">
      <strong>Game Preview</strong>
      <span id="scene-label" class="muted"></span>
    </div>
    <div class="game-right">
      <button id="btn-graphics-panel" class="ghost-btn" title="Configurações gráficas">Graficos</button>
      <button id="btn-back">Voltar ao Editor</button>
    </div>
  </header>

  <div id="game-root">
    <div id="game-menu">
      <section id="menu-step-start" class="menu-step active">
        <div class="menu-card">
          <h1>Modo Caçada</h1>
          <p>Inicia pela cena principal "hunter" e depois carrega os outros mapas.</p>
          <button id="btn-menu-start" class="menu-primary">Iniciar Game</button>
        </div>
      </section>

      <section id="menu-step-map" class="menu-step">
        <div class="menu-card menu-map-card">
          <h2>Escolher Mapa</h2>
          <div class="menu-map-preview">
            <img
              src="assets/ui/maps/layton-lake-map.jpg"
              alt="Mapa da reserva Layton Lake"
              loading="lazy"
            />
            <div class="menu-map-buttons" id="menu-map-regions" aria-label="Regioes clicaveis do mapa"></div>
          </div>
          <p class="menu-map-hint">Clique nos circulos amarelos para abrir as regioes disponiveis.</p>
          <div id="menu-map-status" class="menu-map-status"></div>
          <button id="btn-menu-back" class="menu-back">Voltar</button>
        </div>
      </section>
    </div>

    <div id="game-loading" class="game-loading hidden" aria-live="polite" aria-busy="true">
      <div class="game-loading-card">
        <span class="game-loading-kicker">Carregando</span>
        <strong id="game-loading-label">Preparando mapa...</strong>
      </div>
    </div>

    <div id="game-overlay" class="hidden">Sem camera na cena. Crie uma camera no editor.</div>
    <aside id="graphics-panel" class="graphics-panel collapsed">
      <h3>Qualidade</h3>
      <label>
        Preset
        <select id="gfx-preset"></select>
      </label>
      <label class="check">
        <input type="checkbox" id="gfx-auto-fallback" />
        Auto fallback FPS
      </label>
      <label class="check">
        <input type="checkbox" id="gfx-post-enabled" checked />
        Pos-processamento
      </label>
      <label class="check indent">
        <input type="checkbox" id="gfx-post-ssao" checked />
        SSAO leve
      </label>
      <label class="check indent">
        <input type="checkbox" id="gfx-post-bloom" checked />
        Bloom fraco
      </label>
      <label class="check">
        <input type="checkbox" id="gfx-fog-enabled" checked />
        Fog de distancia
      </label>
      <label class="check">
        <input type="checkbox" id="gfx-debug-enabled" checked />
        Mini mapa
      </label>
      <p id="gfx-status"></p>
    </aside>

    <aside id="minimap-panel">
      <h4 id="minimap-title">Mapa</h4>
      <div class="minimap-frame">
        <canvas id="minimap-canvas" aria-label="Mini mapa em tempo real"></canvas>
        <span id="minimap-player" aria-hidden="true">▲</span>
      </div>
    </aside>

    <div id="inventory-hotbar" class="inventory-hotbar hidden" aria-label="Barra numerica de equipamentos"></div>

    <section id="inventory-panel" class="inventory-panel hidden" aria-hidden="true">
      <div class="inventory-shell">
        <div class="inventory-head">
          <div>
            <span class="inventory-overline">Inventario</span>
            <h3>Equipamento de Caca</h3>
          </div>
          <button id="inventory-close" class="ghost-btn" type="button">Fechar</button>
        </div>
        <p id="inventory-help" class="inventory-help">
          Pressione I para abrir ou fechar. Selecione um item e clique num slot 1-9 para colocar na barra. Clique direito num slot para remover.
        </p>
        <div class="inventory-body">
          <div id="inventory-items" class="inventory-items"></div>
          <aside class="inventory-detail-panel">
            <div id="inventory-detail-card" class="inventory-detail-card"></div>
          </aside>
        </div>
      </div>
    </section>

    <div id="fps-hud" class="hidden">
      <div id="hud-ammo">
        <span id="hud-ammo-current">0</span>
        <span class="sep">/</span>
        <span id="hud-ammo-reserve">0</span>
      </div>
      <div id="hud-status"></div>
    </div>
    <div id="interaction-prompt" class="interaction-prompt hidden"></div>
    <div id="crosshair" class="hidden" aria-hidden="true"></div>
    <div id="hit-marker" aria-hidden="true">X</div>
    <canvas id="game-canvas"></canvas>
  </div>

  <script type="importmap">
    {
      "imports": {
        "three": "https://unpkg.com/three@0.164.1/build/three.module.js",
        "three/addons/": "https://unpkg.com/three@0.164.1/examples/jsm/"
      }
    }
  </script>
  <?php if (file_exists(__DIR__ . '/game.boot.js')): ?>
  <script src="game.boot.js"></script>
  <?php endif; ?>
  <script>
    (function () {
      if (window.__GAME_BOOT_CONFIG__) return;

      var previewConfig = null;
      try {
        if (window.opener && window.opener.__GAME_PREVIEW_BOOT_CONFIG__) {
          previewConfig = window.opener.__GAME_PREVIEW_BOOT_CONFIG__;
        }
      } catch (error) {
        previewConfig = null;
      }

      if (!previewConfig) {
        try {
          var rawConfig = window.localStorage.getItem("gamePreviewBootConfig");
          if (rawConfig) {
            var parsedConfig = JSON.parse(rawConfig);
            var maxAgeMs = 10 * 60 * 1000;
            var ageMs = Date.now() - Number(parsedConfig && parsedConfig.timestamp || 0);
            if (parsedConfig && parsedConfig.source === "editor-preview" && ageMs >= 0 && ageMs <= maxAgeMs) {
              previewConfig = parsedConfig;
            } else if (ageMs > maxAgeMs) {
              window.localStorage.removeItem("gamePreviewBootConfig");
            }
          }
        } catch (error) {
          previewConfig = null;
        }
      }

      if (!previewConfig || previewConfig.source !== "editor-preview") return;
      window.__GAME_BOOT_CONFIG__ = previewConfig;

      try {
        window.localStorage.removeItem("gamePreviewBootConfig");
      } catch (error) {
        // no-op
      }
    })();
  </script>
  <script type="module" src="js/game.js?v=20260413f"></script>
</body>
</html>
