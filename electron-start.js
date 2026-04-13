const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname);
const phpHost = process.env.PHP_HOST || '127.0.0.1';
const phpPort = process.env.PHP_PORT || '8080';
const phpUrl = `http://${phpHost}:${phpPort}`;
const electronBin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');

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

function spawnPhpServer() {
    const { phpPath, triedPaths } = findPhpPath();
    if (!phpPath) {
        throw new Error(`PHP não encontrado. Defina a variável de ambiente PHP_PATH ou instale o PHP no PATH. Caminhos verificados: ${triedPaths.join(', ')}`);
    }

    const args = ['-S', `${phpHost}:${phpPort}`, '-t', projectRoot];
    const php = spawn(phpPath, args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });

    php.stdout.on('data', (data) => {
        process.stdout.write(`[php] ${data}`);
    });

    php.stderr.on('data', (data) => {
        process.stderr.write(`[php] ${data}`);
    });

    php.on('exit', (code, signal) => {
        if (code !== null && code !== 0) {
            console.error(`PHP server saiu com código ${code} (${signal || 'sem sinal'}).`);
        }
    });

    return php;
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

function spawnElectron() {
    if (!fs.existsSync(electronBin)) {
        throw new Error('Electron não está instalado. Execute npm install antes.');
    }

    const electron = spawn(electronBin, [projectRoot], {
        cwd: projectRoot,
        stdio: 'inherit',
    });

    electron.on('exit', (code) => {
        process.exit(code);
    });
}

(async () => {
    const php = spawnPhpServer();

    const cleanup = () => {
        if (!php.killed) {
            php.kill();
        }
    };

    process.on('exit', cleanup);
    process.on('SIGINT', () => process.exit());
    process.on('SIGTERM', () => process.exit());

    try {
        await waitForServer();
        spawnElectron();
    } catch (error) {
        cleanup();
        console.error(error.message);
        process.exit(1);
    }
})();
