#!/usr/bin/env node

/**
 * Script para publicar atualizações do GameEngine3D
 * 
 * Modo de uso:
 * 
 * 1. GitHub Releases (recomendado):
 *    npm run publish:github -- --tag v1.0.1 --release-notes "Correções e melhorias"
 * 
 * 2. Servidor genérico/local:
 *    npm run publish:generic -- --url http://localhost:3000/updates/
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const packageJson = require('../package.json');
const appVersion = packageJson.version;
const appName = packageJson.build.productName;

function getLatestInstallerPath() {
    const distDir = path.join(__dirname, '..', 'dist');
    if (!fs.existsSync(distDir)) {
        throw new Error('Pasta dist não encontrada. Execute "npm run build:app" primeiro.');
    }

    const files = fs.readdirSync(distDir);
    const exeFiles = files.filter(f => f.endsWith('.exe') && !f.endsWith('.blockmap'));

    if (exeFiles.length === 0) {
        throw new Error('Nenhum arquivo .exe encontrado em dist/');
    }

    return path.join(distDir, exeFiles[0]);
}

function generateUpdateMetadata() {
    const installerPath = getLatestInstallerPath();
    const installerSize = fs.statSync(installerPath).size;
    const installerHash = execSync(`certutil -hashfile "${installerPath}" SHA256`).toString().split('\n')[1].trim();

    return {
        version: appVersion,
        files: [
            {
                url: `${appName}-${appVersion}-win-x64.exe`,
                sha256: installerHash,
                size: installerSize
            }
        ],
        releaseDate: new Date().toISOString(),
        releaseName: `${appName} ${appVersion}`
    };
}

function publishToGitHub(tag, releaseNotes) {
    console.log(`📦 Publicando no GitHub Releases como ${tag}...`);

    const installerPath = getLatestInstallerPath();
    const installerName = path.basename(installerPath);

    const ghCommand = `gh release create ${tag} "${installerPath}" --title "${appName} ${appVersion}" --notes "${releaseNotes || 'Release novo'}"`;

    try {
        execSync(ghCommand, { stdio: 'inherit' });
        console.log(`✅ Publicado com sucesso em ${tag}`);
        console.log(`   Acesse: https://github.com/seu-usuario/GAME-ENGINE3D/releases/tag/${tag}`);
    } catch (error) {
        console.error('❌ Erro ao publicar no GitHub. Certifique-se que:');
        console.error('   1. GitHub CLI está instalado: https://cli.github.com/');
        console.error('   2. Você fez login com "gh auth login"');
        console.error('   3. O repositório é público ou você tem permissão de escrita');
        process.exit(1);
    }
}

function publishToGeneric(serverUrl) {
    console.log(`📦 Preparando arquivos para ${serverUrl}...`);

    const installerPath = getLatestInstallerPath();
    const installerName = path.basename(installerPath);
    const distDir = path.join(__dirname, '..', 'dist');

    const metadata = generateUpdateMetadata();
    const latestYml = `version: ${appVersion}
files:
  - url: ${installerName}
    sha256: ${metadata.files[0].sha256}
    size: ${metadata.files[0].size}
releaseDate: '${metadata.releaseDate}'
`;

    const latestYmlPath = path.join(distDir, 'latest.yml');
    fs.writeFileSync(latestYmlPath, latestYml);

    console.log('✅ Arquivos preparados para publicação:');
    console.log(`   - ${installerName}`);
    console.log(`   - latest.yml`);
    console.log('');
    console.log('📤 Próximas etapas:');
    console.log(`   1. Faça upload dos arquivos acima para: ${serverUrl}`);
    console.log(`   2. Atualize o "publish" no package.json:`);
    console.log('      "url": "' + serverUrl + '"');
    console.log(`   3. Rode "npm run build:app" novamente`);
}

function setupLocalServer() {
    console.log('🚀 Iniciando servidor local de atualizações (porta 3000)...');
    console.log('   Os arquivos estarão disponíveis em: http://localhost:3000/updates/');

    const distDir = path.join(__dirname, '..', 'dist');
    const serverScript = `
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const UPDATES_DIR = '${distDir.replace(/\\\\/g, '\\\\\\\\')}';

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimes = {
        '.exe': 'application/octet-stream',
        '.yml': 'text/yaml',
        '.blockmap': 'application/json',
        '.json': 'application/json'
    };
    return mimes[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
    console.log('📥 Requisição:', req.url);
    
    // Garante que está em /updates/
    if (!req.url.startsWith('/updates/')) {
        res.writeHead(404);
        res.end('Não encontrado');
        return;
    }

    const filePath = path.join(UPDATES_DIR, path.basename(req.url));
    
    if (!fs.existsSync(filePath)) {
        console.log('❌ Arquivo não encontrado:', filePath);
        res.writeHead(404);
        res.end('Não encontrado');
        return;
    }

    const mimeType = getMimeType(filePath);
    const fileSize = fs.statSync(filePath).size;

    res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': fileSize,
        'Access-Control-Allow-Origin': '*'
    });

    fs.createReadStream(filePath).pipe(res);
    console.log('✅ Enviando:', path.basename(filePath));
});

server.listen(PORT, () => {
    console.log(\`✅ Servidor rodando em http://localhost:\${PORT}/updates/\`);
    console.log('   Use UPDATE_SERVER_URL=http://localhost:3000/updates/ ao executar o app');
    console.log('   Pressione Ctrl+C para parar o servidor');
});

process.on('SIGINT', () => {
    console.log('\\n🛑 Servidor parado');
    process.exit(0);
});
`;

    const serverFile = path.join(__dirname, '..', 'update-server.js');
    fs.writeFileSync(serverFile, serverScript);

    console.log(`✅ Arquivo de servidor criado: update-server.js`);
    console.log('   Execute: node update-server.js');
}

const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
    case 'github':
        const tagIdx = args.indexOf('--tag');
        const notesIdx = args.indexOf('--release-notes');
        const tag = tagIdx !== -1 ? args[tagIdx + 1] : `v${appVersion}`;
        const notes = notesIdx !== -1 ? args.slice(notesIdx + 1).join(' ') : '';
        publishToGitHub(tag, notes);
        break;

    case 'generic':
        const urlIdx = args.indexOf('--url');
        const url = urlIdx !== -1 ? args[urlIdx + 1] : null;
        if (!url) {
            console.error('❌ Erro: use --url para especificar o servidor');
            console.error('   Exemplo: npm run publish:generic -- --url http://seu-servidor.com/updates/');
            process.exit(1);
        }
        publishToGeneric(url);
        break;

    case 'local':
        setupLocalServer();
        break;

    default:
        console.log('📚 Comandos disponíveis:');
        console.log('');
        console.log('  npm run publish:github -- --tag v1.0.1 [--release-notes "descrição"]');
        console.log('    → Publica no GitHub Releases');
        console.log('');
        console.log('  npm run publish:generic -- --url http://seu-servidor.com/updates/');
        console.log('    → Prepara arquivos para servidor genérico');
        console.log('');
        console.log('  npm run publish:local');
        console.log('    → Cria e inicia servidor local de testes');
        process.exit(1);
}
