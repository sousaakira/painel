const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { exec } = require('child_process');

const store = new Store();
let mainWindow;
let tray = null;

// Função para obter o caminho dos recursos
function getResourcePath() {
    const resourcePath = app.isPackaged
        ? path.join(process.resourcesPath, 'icons')
        : path.join(__dirname, 'build/icons');
    console.log('Caminho dos recursos:', resourcePath);
    return resourcePath;
}

// Função para criar ícones
function createIcon(name) {
    const iconPath = path.join(getResourcePath(), `${name}.png`);
    console.log('Criando ícone:', name, 'em:', iconPath);
    try {
        const icon = nativeImage.createFromPath(iconPath);
        if (icon.isEmpty()) {
            console.error('Erro: Ícone está vazio:', iconPath);
        } else {
            console.log('Ícone criado com sucesso:', name);
        }
        return icon.resize({ width: 16, height: 16 });
    } catch (error) {
        console.error('Erro ao criar ícone:', name, error);
        return null;
    }
}

function createWindow() {
    const iconPath = path.join(getResourcePath(), 'taskbar.png');
    console.log('Criando janela com ícone:', iconPath);
    
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#1a1a1a',
        icon: iconPath,
        show: false
    });

    mainWindow.loadFile('index.html');

    // Mostrar a janela quando estiver pronta
    mainWindow.once('ready-to-show', () => {
        console.log('Janela pronta para mostrar');
        mainWindow.show();
    });

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
    console.log('Criando tray...');
    const icon = createIcon('icon');
    if (!icon) {
        console.error('Não foi possível criar o ícone do tray');
        return;
    }
    
    tray = new Tray(icon);
    tray.setToolTip('Painel de Servidores');
    console.log('Tray criado com sucesso');

    // Atualizar o menu do tray quando os servidores mudarem
    updateTrayMenu();

    // Mostrar a janela principal ao clicar no ícone
    tray.on('click', () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
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
    updateTrayMenu();
    return categories;
});

ipcMain.handle('edit-category', async (event, { index, category }) => {
    try {
        const categories = await store.get('categories', []);
        categories[index] = { ...categories[index], ...category };
        await store.set('categories', categories);
        return true;
    } catch (error) {
        console.error('Erro ao editar categoria:', error);
        return false;
    }
});

ipcMain.handle('remove-category', (event, index) => {
    const categories = store.get('categories') || [];
    categories.splice(index, 1);
    store.set('categories', categories);
    updateTrayMenu();
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
    updateTrayMenu();
    return categories[categoryIndex].servers;
});

ipcMain.handle('edit-server', async (event, { categoryIndex, serverIndex, server }) => {
    try {
        const categories = await store.get('categories', []);
        categories[categoryIndex].servers[serverIndex] = server;
        await store.set('categories', categories);
        return true;
    } catch (error) {
        console.error('Erro ao editar servidor:', error);
        return false;
    }
});

ipcMain.handle('remove-server', (event, { categoryIndex, serverIndex }) => {
    const categories = store.get('categories') || [];
    categories[categoryIndex].servers.splice(serverIndex, 1);
    store.set('categories', categories);
    updateTrayMenu();
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

// Handlers para gerenciar estados dos collapses
ipcMain.handle('get-collapsed-states', () => {
    return store.get('collapsedStates', {});
});

ipcMain.handle('save-collapsed-states', (event, states) => {
    store.set('collapsedStates', states);
    return true;
}); 