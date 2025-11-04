const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    ensureDir: async (dirPath) => {
        return await ipcRenderer.invoke('ensureDir', dirPath);
    },
    
    fileExists: async (filePath) => {
        return await ipcRenderer.invoke('fileExists', filePath);
    },
    
    writeFile: async (filePath, data, encoding) => {
        return await ipcRenderer.invoke('writeFile', { filePath, data, encoding });
    },

    getResourcePath: async (filePath) => {
        return await ipcRenderer.invoke('getResourcePath', filePath);
    },

    downloadImage: async (url, filePath) => {
        return await ipcRenderer.invoke('downloadImage', { url, filePath });
    },

    saveApiKey: async (apiKey) => {
        return await ipcRenderer.invoke('saveApiKey', apiKey);
    },

    getApiKey: async () => {
        return await ipcRenderer.invoke('getApiKey');
    },

    loadGameData: async () => {
        return await ipcRenderer.invoke('loadGameData');
    },

    saveGameData: async (data) => {
        return await ipcRenderer.invoke('saveGameData', data);
    }
});