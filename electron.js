const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const projectRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.resolve(__dirname);
const phpHost = process.env.PHP_HOST || '127.0.0.1';
const phpPort = process.env.PHP_PORT || '8080';
const phpUrl = `http://${phpHost}:${phpPort}`;

function findPhpPath() {
    const triedPaths = [];
    const envPath = process.env.PHP_PATH;
    if (envPath) {
        triedPaths.push(envPath);
        if (fs.existsSync(envPath)) {
            return { phpPath: envPath, triedPaths };
        }
    }

    if (process.platform === 'win32') {
        try {
            const whereOutput = execSync('where php', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            for (const candidate of whereOutput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
                triedPaths.push(candidate);
                if (fs.existsSync(candidate)) {
                    return { phpPath: candidate, triedPaths };
                }
            }
        } catch (error) {
            // ignore missing PATH lookup
        }

        const mampBase = path.join('C:', 'MAMP', 'bin', 'php');
        triedPaths.push(mampBase);
        if (fs.existsSync(mampBase)) {
            const versions = fs.readdirSync(mampBase, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => path.join(mampBase, entry.name, 'php.exe'))
                .filter((candidate) => fs.existsSync(candidate));

            if (versions.length > 0) {
                versions.sort().reverse();
                return { phpPath: versions[0], triedPaths };
            }

            const directPhp = path.join(mampBase, 'php.exe');
            triedPaths.push(directPhp);
            if (fs.existsSync(directPhp)) {
                return { phpPath: directPhp, triedPaths };
            }
        }

        const commonPhpPaths = [
            'C:\\php\\php.exe',
            'C:\\Program Files\\PHP\\php.exe',
            'C:\\Program Files (x86)\\PHP\\php.exe',
        ];
        for (const candidate of commonPhpPaths) {
            triedPaths.push(candidate);
            if (fs.existsSync(candidate)) {
                return { phpPath: candidate, triedPaths };
            }
        }
    } else {
        const commandPath = 'php';
        triedPaths.push(commandPath);
        try {
            const whichOutput = execSync('which php', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            if (whichOutput && fs.existsSync(whichOutput)) {
                return { phpPath: whichOutput, triedPaths };
            }
        } catch (error) {
            // ignore
        }
    }

    return { phpPath: null, triedPaths };
}

let phpProcess = null;

function spawnPhpServer() {
    const { phpPath, triedPaths } = findPhpPath();
    if (!phpPath) {
        throw new Error(`PHP não encontrado. Defina a variável de ambiente PHP_PATH ou instale o PHP no PATH. Caminhos verificados: ${triedPaths.join(', ')}`);
    }

    const args = ['-S', `${phpHost}:${phpPort}`, '-t', projectRoot];
    phpProcess = spawn(phpPath, args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });

    phpProcess.on('error', (error) => {
        showFatalError(`Falha ao iniciar o PHP em ${phpPath}: ${error.message}\nCaminhos verificados: ${triedPaths.join(', ')}`);
        if (phpProcess && !phpProcess.killed) {
            phpProcess.kill();
        }
        app.quit();
    });

    phpProcess.stdout.on('data', (data) => {
        console.log(`[php] ${data}`);
    });

    phpProcess.stderr.on('data', (data) => {
        console.error(`[php] ${data}`);
    });

    phpProcess.on('exit', (code, signal) => {
        if (code !== null && code !== 0) {
            console.error(`PHP server saiu com código ${code} (${signal || 'sem sinal'}).`);
        }
    });

    return phpProcess;
}

function waitForServer(retries = 30, delay = 250) {
    return new Promise((resolve, reject) => {
        const tryCheck = () => {
            http.get(phpUrl, (res) => {
                res.destroy();
                resolve();
            }).on('error', () => {
                if (retries <= 0) {
                    reject(new Error(`Servidor PHP não respondeu em ${phpUrl}`));
                    return;
                }
                retries -= 1;
                setTimeout(tryCheck, delay);
            });
        };
        tryCheck();
    });
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 720,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    win.loadURL('http://127.0.0.1:8080/index.php');
    win.removeMenu();
}

function notifyUpdateDownloaded() {
    const result = dialog.showMessageBoxSync({
        type: 'info',
        buttons: ['Reiniciar agora', 'Mais tarde'],
        defaultId: 0,
        cancelId: 1,
        title: 'Atualização disponível',
        message: 'Uma nova versão foi baixada. Deseja reiniciar o aplicativo para instalar agora?',
    });

    if (result === 0) {
        autoUpdater.quitAndInstall();
    }
}

function showFatalError(message) {
    console.error(message);
    dialog.showErrorBox('Erro ao iniciar o aplicativo', message);
}

function setupAutoUpdater() {
    if (!app.isPackaged) {
        return;
    }

    const updateUrl = process.env.UPDATE_SERVER_URL || process.env.UPDATE_URL;
    if (updateUrl) {
        autoUpdater.setFeedURL({ provider: 'generic', url: updateUrl });
    }

    autoUpdater.autoDownload = true;

    autoUpdater.on('checking-for-update', () => {
        console.log('Verificando atualizações...');
    });

    autoUpdater.on('update-available', (info) => {
        console.log('Atualização disponível:', info.version);
    });

    autoUpdater.on('update-not-available', () => {
        console.log('Nenhuma atualização encontrada.');
    });

    autoUpdater.on('error', (error) => {
        console.error('Erro de atualização:', error == null ? 'sem dados' : error.message);
    });

    autoUpdater.on('download-progress', (progress) => {
        console.log(`Download da atualização: ${Math.round(progress.percent)}%`);
    });

    autoUpdater.on('update-downloaded', () => {
        notifyUpdateDownloaded();
    });
}

app.on('ready', async () => {
    try {
        setupAutoUpdater();
        spawnPhpServer();
        await waitForServer();
        createWindow();
        if (app.isPackaged) {
            autoUpdater.checkForUpdatesAndNotify();
        }
    } catch (error) {
        showFatalError(error.message);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (phpProcess && !phpProcess.killed) {
        phpProcess.kill();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
