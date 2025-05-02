const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { exec } = require('child_process');

const store = new Store();
let mainWindow;
let tray = null;

// Função para obter o caminho dos recursos
function getResourcePath() {
    return app.isPackaged
        ? path.join(process.resourcesPath, 'icons')
        : path.join(__dirname, 'build/icons');
}

// Função para criar ícones
function createIcon(name) {
    const iconPath = path.join(getResourcePath(), `${name}.png`);
    return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#1a1a1a',
        icon: path.join(getResourcePath(), 'icon.png')
    });

    mainWindow.loadFile('index.html');

    // Minimizar para tray ao invés de fechar
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });
}

function createTray() {
    const icon = createIcon('icon');
    tray = new Tray(icon);
    tray.setToolTip('Painel de Servidores');

    // Atualizar o menu do tray quando os servidores mudarem
    updateTrayMenu();

    // Mostrar a janela principal ao clicar no ícone
    tray.on('click', () => {
        mainWindow.show();
    });
}

function updateTrayMenu() {
    const categories = store.get('categories', []);
    const template = [
        {
            label: 'Abrir Painel',
            icon: createIcon('open'),
            click: () => {
                mainWindow.show();
            }
        },
        { type: 'separator' }
    ];

    // Adicionar servidores ao menu
    categories.forEach(category => {
        if (category.servers && category.servers.length > 0) {
            const submenu = category.servers.map(server => {
                const serverIcon = server.type === 'web' ? 'web' : 'ssh';
                return {
                    label: server.name,
                    icon: createIcon(serverIcon),
                    click: () => {
                        if (server.type === 'web') {
                            shell.openExternal(server.url);
                        } else {
                            const command = `gnome-terminal -- bash -c "ssh ${server.username}@${server.host} -p ${server.port}; exec bash"`;
                            exec(command);
                        }
                    }
                };
            });

            template.push({
                label: category.name,
                icon: createIcon('folder'),
                submenu: submenu
            });
        }
    });

    template.push(
        { type: 'separator' },
        {
            label: 'Sair',
            icon: createIcon('exit'),
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    );

    const contextMenu = Menu.buildFromTemplate(template);
    tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
    createWindow();
    createTray();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC handlers para gerenciar categorias
ipcMain.handle('get-categories', () => {
    return store.get('categories', []);
});

ipcMain.handle('add-category', (event, category) => {
    const categories = store.get('categories', []);
    categories.push(category);
    store.set('categories', categories);
    updateTrayMenu(); // Atualizar menu do tray
    return categories;
});

ipcMain.handle('remove-category', (event, index) => {
    const categories = store.get('categories') || [];
    categories.splice(index, 1);
    store.set('categories', categories);
    updateTrayMenu(); // Atualizar menu do tray
    return categories;
});

// IPC handlers para gerenciar servidores
ipcMain.handle('get-servers', (event, categoryIndex) => {
    const categories = store.get('categories') || [];
    return categories[categoryIndex]?.servers || [];
});

ipcMain.handle('add-server', (event, { categoryIndex, server }) => {
    const categories = store.get('categories', []);
    if (!categories[categoryIndex].servers) {
        categories[categoryIndex].servers = [];
    }
    categories[categoryIndex].servers.push(server);
    store.set('categories', categories);
    updateTrayMenu(); // Atualizar menu do tray
    return categories[categoryIndex].servers;
});

ipcMain.handle('remove-server', (event, { categoryIndex, serverIndex }) => {
    const categories = store.get('categories') || [];
    categories[categoryIndex].servers.splice(serverIndex, 1);
    store.set('categories', categories);
    updateTrayMenu(); // Atualizar menu do tray
    return categories[categoryIndex].servers;
});

ipcMain.handle('open-url', (event, url) => {
    shell.openExternal(url);
});

// Handler para abrir terminal externo
ipcMain.handle('open-terminal', (event, { host, username, port }) => {
    const command = `gnome-terminal -- bash -c "ssh ${username}@${host} -p ${port}; exec bash"`;
    exec(command);
}); 