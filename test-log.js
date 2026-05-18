const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  
  win.webContents.on('console-message', (event, level, message) => {
    console.log('[ RENDERER ]', message);
  });
  
  win.loadFile('src/renderer/index.html');
});
