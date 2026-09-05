const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadCreators: () => ipcRenderer.invoke('load-creators'),
  saveCreators: (creators) => ipcRenderer.invoke('save-creators', creators),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  exportCsv: (creators) => ipcRenderer.invoke('export-csv', creators),
  lookupCreator: (payload) => ipcRenderer.invoke('lookup-creator', payload),
  lookupCreatorApify: (payload) => ipcRenderer.invoke('lookup-creator-apify', payload),
  bulkCheckApify: (payload) => ipcRenderer.invoke('bulk-check-apify', payload),
  onBulkCheckProgress: (callback) => ipcRenderer.on('bulk-check-progress', (event, data) => callback(data)),
  discoverCreators: (payload) => ipcRenderer.invoke('discover-creators', payload),
  discoverCreatorsApify: (payload) => ipcRenderer.invoke('discover-creators-apify', payload),
  restartAndInstall: () => ipcRenderer.invoke('restart-and-install'),
  checkForUpdatesNow: () => ipcRenderer.invoke('check-for-updates-now'),
  verifyApifyToken: (payload) => ipcRenderer.invoke('verify-apify-token', payload),
  verifyBrightDataCredentials: (payload) => ipcRenderer.invoke('verify-brightdata-credentials', payload),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, data) => callback(data))
});
