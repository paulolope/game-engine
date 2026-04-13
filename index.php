<!DOCTYPE html>
<html lang="pt-BR">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mini Unity - Editor 3D</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet">
    <link rel="stylesheet" href="css/style.css?v=20260413l" />
</head>

<body>
    <div id="app">
        <header id="toolbar" class="topbar">
            <div class="topbar-row topbar-row-primary">
                <div class="topbar-brand-inline">
                    <span class="brand">Engine Studio</span>
                    <span class="brand-kicker">Editor 3D</span>
                </div>
                <div class="topbar-menu-inline">
                    <button class="menu-btn">File</button>
                    <button class="menu-btn">Edit</button>
                    <button class="menu-btn" id="menu-assets">Assets</button>
                    <button class="menu-btn">Object</button>
                    <button class="menu-btn" id="btn-window-fullscreen">Window</button>
                    <button class="menu-btn">Help</button>
                </div>
                <div class="topbar-utility-inline">
                    <button id="btn-toggle-project" class="ghost toggle-btn" title="Mostrar/ocultar Assets">Asset
                        Browser</button>
                    <button id="btn-toggle-console" class="ghost toggle-btn"
                        title="Mostrar/ocultar Console">Timeline</button>
                </div>
            </div>

            <div class="topbar-row topbar-row-secondary">
                <div class="toolbar-inline toolbar-scene-inline">
                    <span class="toolbar-label">Scene</span>
                    <button id="btn-new" class="ghost" title="Nova Cena">New</button>
                    <input id="scene-name" type="text" placeholder="Cena" />
                    <select id="scene-list" title="Cenas"></select>
                    <button id="btn-save" class="primary" title="Salvar">Save</button>
                    <button id="btn-load" title="Carregar">Load</button>
                </div>
                <div class="toolbar-inline toolbar-snap-inline">
                    <span class="toolbar-label">Snap</span>
                    <label class="toggle">
                        <input type="checkbox" id="snap-toggle" />
                        <span>Enable</span>
                    </label>
                    <div class="snap-inputs">
                        <label>Move <input id="snap-move" type="number" value="0.5" step="0.1" /></label>
                        <label>Rot <input id="snap-rot" type="number" value="15" step="1" /></label>
                        <label>Scale <input id="snap-scale" type="number" value="0.1" step="0.05" /></label>
                    </div>
                </div>
                <div class="toolbar-inline toolbar-runtime-inline">
                    <span class="toolbar-label">Run</span>
                    <button id="btn-play" class="accent" title="Play">Play</button>
                    <button id="btn-game-preview" class="ghost" title="Preview">Preview</button>
                    <button id="btn-export-game" class="primary" title="Exportar jogo em ZIP">Export</button>
                </div>
            </div>
        </header>

        <aside id="hierarchy" class="panel">
            <div class="panel-header">
                <div class="panel-title">
                    <h2>Outliner</h2>
                    <span class="panel-subtitle">Scene Collection</span>
                </div>
                <div class="panel-actions">
                    <button id="btn-duplicate" class="ghost" title="Duplicar (Ctrl+D)">Duplicate</button>
                    <button id="btn-delete" class="danger" title="Deletar (Del)">Delete</button>
                </div>
            </div>
            <div class="panel-toolbar hierarchy-toolbar">
                <input id="hierarchy-search" type="text" placeholder="Buscar objeto..." />
                <select id="create-object" title="Criar Objeto">
                    <option value="">+ Criar Objeto</option>
                    <option value="fps_player">FPS Player</option>
                    <option value="empty">Empty</option>
                    <option value="spawn_volume">Region Spawner / Spawn Volume</option>
                    <option value="camera">Camera</option>
                    <option value="terrain">Terreno</option>
                    <option value="cube">Cubo</option>
                    <option value="sphere">Esfera</option>
                    <option value="plane">Plano</option>
                    <option value="light_directional">Directional Light</option>
                    <option value="light_point">Point Light</option>
                    <option value="light_spot">Spot Light</option>
                    <option value="light_ambient">Ambient Light</option>
                    <option value="light_hemisphere">Hemisphere Light</option>
                </select>
                <div class="toolbar-split">
                    <select id="parent-select" title="Parent"></select>
                    <button id="btn-set-parent" title="Aplicar Parent">Parent</button>
                    <button id="btn-clear-parent" class="ghost" title="Remover Parent">Unparent</button>
                </div>
            </div>
            <div class="panel-body">
                <div id="hierarchy-list"></div>
            </div>
        </aside>

        <main id="viewport" class="panel viewport-panel">
            <div class="panel-header panel-tabs">
                <div class="tabbar">
                    <button class="tab-btn active" id="tab-scene">Layout</button>
                    <button class="tab-btn" id="tab-game">Game</button>
                    <button class="tab-btn" id="tab-animator">Animator</button>
                    <button class="tab-btn" id="tab-asset-store">Asset Browser</button>
                </div>
                <div class="panel-actions">
                    <button id="btn-viewport-focus" class="ghost" title="Focar (F)">Frame</button>
                    <button id="btn-viewport-grid" class="ghost toggle-btn active"
                        title="Mostrar/ocultar Grid">Grid</button>
                    <button id="btn-viewport-gizmos" class="ghost toggle-btn active"
                        title="Mostrar/ocultar Gizmos">Gizmos</button>
                </div>
            </div>
            <div id="scene-switcher" hidden>
                <div class="scene-switcher-row">
                    <select id="scene-switcher-list" title="Trocar cena"></select>
                    <button id="btn-scene-switcher-open">Abrir</button>
                    <button id="btn-scene-switcher-new" class="ghost">Nova</button>
                    <button id="btn-scene-switcher-delete" class="danger">Excluir</button>
                </div>
            </div>
            <div id="viewport-top">
                <span class="badge" id="selection-label">Nenhum objeto selecionado</span>
                <span class="badge" id="camera-label">Camera: Orbit</span>
            </div>
            <div id="viewport-toolbox" aria-label="Ferramentas do viewport">
                <button class="tool-btn" data-tool="translate" title="Mover (W)">Move</button>
                <button class="tool-btn" data-tool="rotate" title="Rotacionar (E)">Rot</button>
                <button class="tool-btn" data-tool="scale" title="Escalar (R)">Scale</button>
                <button class="menu-btn viewport-nav-btn" id="btn-camera-look"
                    title="Modo navegação da câmera (sem editar)">Look</button>
            </div>
            <canvas id="viewport-canvas"></canvas>
        </main>

        <aside id="inspector" class="panel">
            <div class="panel-header panel-tabs">
                <div class="tabbar">
                    <button class="tab-btn active">Properties</button>
                    <button class="tab-btn">Object</button>
                    <button class="tab-btn">Scene</button>
                </div>
            </div>
            <div class="panel-body" id="inspector-content">
                <div class="empty-state inspector-empty">
                    <span class="empty-state-kicker">Inspector</span>
                    <h3>Nada selecionado</h3>
                    <p>Selecione um objeto na Hierarchy para editar transform, componentes, luzes, IA e propriedades do
                        mapa.</p>
                    <div class="empty-state-chip-row">
                        <span class="empty-state-chip">W mover</span>
                        <span class="empty-state-chip">E rotacionar</span>
                        <span class="empty-state-chip">R escalar</span>
                        <span class="empty-state-chip">F focar</span>
                    </div>
                </div>
            </div>
        </aside>

        <section id="assets" class="panel">
            <div class="panel-header">
                <div class="panel-title">
                    <h2>Asset Browser</h2>
                    <span class="panel-subtitle">Project Files</span>
                </div>
                <div class="panel-actions">
                    <button id="btn-toggle-assets" class="ghost">Hide</button>
                    <label class="file-btn">
                        Importar GLB
                        <input id="file-glb" type="file" accept=".glb" />
                    </label>
                    <label class="file-btn">
                        Importar pasta GLTF
                        <input id="file-gltf" type="file" webkitdirectory multiple />
                    </label>
                    <label class="file-btn">
                        Importar Textura
                        <input id="file-texture" type="file" accept="image/*,.png,.jpg,.jpeg" />
                    </label>
                    <label class="file-btn">
                        Importar Audio
                        <input id="file-audio" type="file" accept=".mp3,.ogg,.wav,.m4a,.aac,audio/*" />
                    </label>
                </div>
            </div>
            <div class="panel-toolbar">
                <div class="project-scene-tools">
                    <button id="btn-project-new-scene" class="ghost" title="Criar e salvar nova cena">Nova
                        Scene</button>
                    <select id="project-scene-list" title="Scenes do projeto">
                        <option value="">(Sem cenas)</option>
                    </select>
                    <button id="btn-project-open-scene" title="Abrir cena selecionada">Abrir</button>
                    <button id="btn-project-delete-scene" class="danger"
                        title="Excluir cena selecionada">Excluir</button>
                </div>
                <input id="assets-search" type="text" placeholder="Buscar assets..." />
            </div>
            <div class="panel-body" id="assets-list"></div>
        </section>

        <section id="console" class="panel">
            <div class="panel-header panel-tabs">
                <div class="tabbar">
                    <button class="tab-btn active">Timeline</button>
                    <button class="tab-btn">Console</button>
                </div>
                <div class="panel-actions">
                    <button id="btn-assets-restore" class="ghost" style="display:none;">Assets</button>
                    <button id="btn-console-toggle" class="ghost">Hide</button>
                    <button class="ghost">Clear</button>
                </div>
            </div>
            <div class="panel-body">
                <div class="empty-state console-empty">
                    <span class="empty-state-kicker">Console</span>
                    <h3>Area de diagnostico</h3>
                    <p>Use este painel para logs, estado de animacao e feedback rapido do runtime. Ele pode ficar
                        fechado quando voce quiser mais viewport livre.</p>
                </div>
            </div>
        </section>
    </div>

    <div id="preview-modal" class="hidden">
        <div class="preview-card">
            <div class="preview-header">
                <h3 id="preview-title">Preview</h3>
                <button id="preview-close">Fechar</button>
            </div>
            <div class="canvas-body">
                <div class="overlay visible" id="preview-status">Carregando preview...</div>
                <canvas id="preview-canvas"></canvas>
            </div>
        </div>
    </div>

    <div id="game-modal" class="hidden">
        <div class="preview-card game-card">
            <div class="preview-header">
                <div class="game-header-left">
                    <h3>Game Preview</h3>
                    <select id="game-camera-select"></select>
                </div>
                <button id="game-close">Fechar</button>
            </div>
            <div class="canvas-body">
                <div class="overlay" id="game-empty">Sem Game Camera</div>
                <canvas id="game-modal-canvas"></canvas>
            </div>
        </div>
    </div>

    <div id="sketchfab-modal" class="hidden">
        <div class="sketchfab-modal-card">
            <button id="sketchfab-browser-close" class="hidden" type="button">Fechar</button>
            <div id="sketchfab-browser-root" class="sketchfab-browser-root"></div>
        </div>
    </div>

    <script type="importmap">
        {
      "imports": {
        "three": "https://unpkg.com/three@0.164.1/build/three.module.js",
        "three/addons/": "https://unpkg.com/three@0.164.1/examples/jsm/"
      }
    }
  </script>
    <script type="module" src="js/main.js?v=20260413i"></script>
</body>

</html>