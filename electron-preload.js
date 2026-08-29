const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadCreators: () => ipcRenderer.invoke('load-creators'),
  saveCreators: (creators) => ipcRenderer.invoke('save-creators', creators),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  exportCsv: (creators) => ipcRenderer.invoke('export-csv', creators),
  lookupCreator: (payload) => ipcRenderer.invoke('lookup-creator', payload),
  discoverCreators: (payload) => ipcRenderer.invoke('discover-creators', payload),
  restartAndInstall: () => ipcRenderer.invoke('restart-and-install'),
  checkForUpdatesNow: () => ipcRenderer.invoke('check-for-updates-now'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, data) => callback(data))
});
