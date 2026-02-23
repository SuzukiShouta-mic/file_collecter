const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getModifiedFiles: (folderPath, hours, excludeFolders, customDate) => ipcRenderer.invoke('get-modified-files', folderPath, hours, excludeFolders, customDate),
  collectFiles: (files, destinationPath, preserveStructure) => ipcRenderer.invoke('collect-files', files, destinationPath, preserveStructure),
  ipcRenderer: {
    on: (channel, func) => ipcRenderer.on(channel, func),
    removeListener: (channel, func) => ipcRenderer.removeListener(channel, func)
  }
});