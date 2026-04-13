#!/usr/bin/env node

/**
 * Script para publicar releases no GitHub usando a API REST
 * Requer um Personal Access Token do GitHub
 * 
 * Execute com: node scripts/publish-github-release.js v1.0.0 "Release notes"
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const TOKEN = process.env.GITHUB_TOKEN;
const OWNER = 'paulolope';
const REPO = 'game-engine';
const TAG = process.argv[2];
const RELEASE_NOTES = process.argv[3] || 'Release notes';

if (!TOKEN) {
    console.error('❌ Erro: GITHUB_TOKEN não definido');
    console.error('\nConfigure seu token com:');
    console.error('  set GITHUB_TOKEN=seu_token_aqui');
    console.error('\nOu no PowerShell:');
    console.error('  $env:GITHUB_TOKEN="seu_token_aqui"');
    console.error('\nPara criar um token, acesse:');
    console.error('  https://github.com/settings/tokens?type=beta');
    console.error('  Scope: public_repo');
    process.exit(1);
}

if (!TAG) {
    console.error('❌ Uso: node scripts/publish-github-release.js v1.0.0 "Release notes"');
    process.exit(1);
}

function findInstallerPath() {
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

function fileToBase64(filePath) {
    return fs.readFileSync(filePath, 'base64');
}

async function createRelease() {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            tag_name: TAG,
            name: TAG,
            body: RELEASE_NOTES,
            draft: false,
            prerelease: false
        });

        const options = {
            hostname: 'api.github.com',
            port: 443,
            path: `/repos/${OWNER}/${REPO}/releases`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'Content-Length': postData.length,
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'GameEngine3D-Publisher'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`GitHub API error: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function uploadAsset(releaseId, filePath, fileName) {
    return new Promise((resolve, reject) => {
        const fileContent = fs.readFileSync(filePath);
        
        const options = {
            hostname: 'uploads.github.com',
            port: 443,
            path: `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${fileName}`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/octet-stream',
                'Content-Length': fileContent.length,
                'User-Agent': 'GameEngine3D-Publisher'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Upload error: ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.write(fileContent);
        req.end();
    });
}

async function publish() {
    try {
        const installerPath = findInstallerPath();
        const installerName = path.basename(installerPath);

        console.log(`📦 Criando release ${TAG}...`);
        const release = await createRelease();
        console.log(`✅ Release criado com ID ${release.id}`);

        console.log(`📤 Enviando ${installerName}...`);
        await uploadAsset(release.id, installerPath, installerName);
        console.log(`✅ Arquivo enviado`);

        console.log(`\n✨ Release publicado com sucesso!`);
        console.log(`📥 Baixe em: ${release.html_url}`);
        console.log(`🔗 URL direto: https://github.com/${OWNER}/${REPO}/releases/tag/${TAG}`);
    } catch (error) {
        console.error('❌ Erro ao publicar:', error.message);
        process.exit(1);
    }
}

publish();
