const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const https = require('https');

// Configura os eventos IPC para manipulação de arquivos
ipcMain.handle('ensureDir', async (event, dirPath) => {
    const fullPath = path.join(app.getPath('userData'), dirPath);
    try {
        await fsPromises.access(fullPath);
    } catch {
        await fsPromises.mkdir(fullPath, { recursive: true });
    }
    return fullPath;
});

ipcMain.handle('fileExists', async (event, filePath) => {
    const fullPath = path.join(app.getPath('userData'), filePath);
    try {
        await fsPromises.access(fullPath);
        return true;
    } catch {
        return false;
    }
});

ipcMain.handle('writeFile', async (event, { filePath, data, encoding }) => {
    const fullPath = path.join(app.getPath('userData'), filePath);
    if (encoding === 'base64') {
        const buffer = Buffer.from(data, 'base64');
        await fsPromises.writeFile(fullPath, buffer);
    } else {
        await fsPromises.writeFile(fullPath, data, encoding);
    }
    return fullPath;
});

ipcMain.handle('getResourcePath', (event, filePath) => {
    return path.join(app.getPath('userData'), filePath);
});

// Configuração do ícone baseado no sistema operacional
const getIconPath = () => {
    const iconPath = path.join(__dirname, 'src', 'assets', 'icon.ico')
    if (fs.existsSync(iconPath)) {
        return iconPath
    }
    return null
}

// Ensure data directory exists
const userDataPath = app.getPath('userData')
const dataPath = path.join(userDataPath, 'data.json')

// Initialize data file if it doesn't exist
if (!fs.existsSync(dataPath)) {
  fs.writeFileSync(dataPath, JSON.stringify({
    games: [],
    toPlayGames: []
  }))
}

// Função para carregar dados dos jogos
function loadGameData() {
    try {
        const data = fs.readFileSync(dataPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading game data:', error);
        return { games: [], toPlayGames: [] };
    }
}

// Função para salvar dados dos jogos
function saveGameData(data) {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving game data:', error);
        return false;
    }
}

// Handlers para dados dos jogos
ipcMain.handle('loadGameData', async () => {
    return loadGameData();
});

ipcMain.handle('saveGameData', async (event, data) => {
    return saveGameData(data);
});

// Define o caminho do arquivo de configuração
const configPath = path.join(app.getPath('userData'), 'config.json');

// Função para carregar configurações
function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(data);
        }
        // If file doesn't exist, create default config
        const defaultConfig = { apiKey: '' };
        saveConfig(defaultConfig);
        return defaultConfig;
    } catch (error) {
        console.error('Error loading config:', error);
        return { apiKey: '' };
    }
}

// Função para salvar configurações
function saveConfig(config) {
    try {
        // Ensure userData directory exists
        if (!fs.existsSync(app.getPath('userData'))) {
            fs.mkdirSync(app.getPath('userData'), { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        return false;
    }
}

// Handlers para API Key
ipcMain.handle('saveApiKey', async (event, apiKey) => {
    const config = loadConfig();
    config.apiKey = apiKey;
    saveConfig(config);
    return true;
});

ipcMain.handle('getApiKey', async () => {
    const config = loadConfig();
    return config.apiKey;
});

let mainWindow = null

function createWindow () {
  // Verifica se já existe uma janela aberta
  if (mainWindow) {
    mainWindow.focus()
    return
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.loadFile('src/index.html')

  mainWindow.on('closed', function () {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('downloadImage', async (event, { url, filePath }) => {
  const fullPath = path.join(app.getPath('userData'), 'Resources', filePath);
  
  // Ensure Resources directory exists
  if (!fs.existsSync(path.join(app.getPath('userData'), 'Resources'))) {
    fs.mkdirSync(path.join(app.getPath('userData'), 'Resources'), { recursive: true });
  }

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(fullPath);
      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(fullPath);
      });

      file.on('error', (err) => {
        fs.unlink(fullPath, () => reject(err));
      });
    }).on('error', reject);
  });
});