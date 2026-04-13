#!/usr/bin/env node

/**
 * Script de configuração para publicação no GitHub Releases
 * 
 * Execute com: node scripts/setup-github-publish.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (prompt) => {
    return new Promise(resolve => {
        rl.question(prompt, resolve);
    });
};

async function setup() {
    console.log('🚀 Configuração de Publicação no GitHub Releases\n');

    const likeGitHub = await question('Você tem um repositório no GitHub? (S/n): ');
    if (likeGitHub.toLowerCase() !== 's' && likeGitHub !== '') {
        console.log('\n❌ Se quiser usar GitHub Releases, crie um repositório em https://github.com/new');
        rl.close();
        return;
    }

    const username = await question('Seu usuário GitHub (ex: seu-usuario): ');
    const repoName = await question('Nome do repositório (ex: GAME-ENGINE3D): ');

    if (!username || !repoName) {
        console.log('\n❌ Usuário e repositório são obrigatórios');
        rl.close();
        return;
    }

    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    packageJson.build.publish = [
        {
            provider: 'github',
            owner: username,
            repo: repoName
        }
    ];

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

    console.log('\n✅ Configuração concluída!\n');
    console.log('📝 Próximas etapas:\n');
    console.log('1. Instale o GitHub CLI:');
    console.log('   https://cli.github.com/\n');
    console.log('2. Faça login com o GitHub:');
    console.log('   gh auth login\n');
    console.log('3. Configure seu repositório remoto:');
    console.log(`   git remote set-url origin https://github.com/${username}/${repoName}.git\n`);
    console.log('4. Compile o app:');
    console.log('   npm run build:app\n');
    console.log('5. Publique a primeira versão:');
    console.log('   npm run publish:github -- --tag v1.0.0 --release-notes "Versão inicial"\n');
    console.log(`📦 As atualizações serão publicadas em:\n   https://github.com/${username}/${repoName}/releases\n`);

    rl.close();
}

setup().catch(console.error);
