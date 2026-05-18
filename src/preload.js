const { contextBridge, ipcRenderer, clipboard } = require('electron');

const INVOKE_CHANNELS = [
  'get-config', 'set-config',
  'window-minimize', 'window-maximize', 'window-close',
  'get-models', 'add-model', 'remove-model',
  'tool-read', 'tool-write', 'tool-edit', 'tool-glob', 'tool-grep',
  'tool-bash', 'tool-list-dir',
  'get-file-tree', 'select-folder', 'get-work-dir', 'set-work-dir',
  'read-image', 'paste-image',
  'claude-api', 'claude-api-stream',
  'get-tool-definitions', 'execute-tool',
  'agent-start', 'agent-cancel',
  'get-memory', 'save-memory', 'delete-memory',
  'get-skills', 'save-skills', 'read-skill-file',
  'get-mcp-servers', 'save-mcp-servers', 'test-mcp-server',
  'mcp-connect', 'mcp-disconnect', 'mcp-status',
  'fetch-web-content', 'add-mcp-from-url',
  'get-recent-projects', 'add-recent-project',
  'get-app-icon'
];

const ON_CHANNELS = [
  'stream-chunk',
  'agent-stream-text', 'agent-stream-tool-start', 'agent-stream-tool-result',
  'agent-complete', 'agent-permission-request',
  'auto-memories-extracted', 'mcp-status'
];

const SEND_CHANNELS = [
  'agent-permission-response'
];

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => {
    if (INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    console.warn('[Preload] Blocked invoke on invalid channel:', channel);
    return Promise.reject(new Error(`Invalid invoke channel: ${channel}`));
  },

  send: (channel, ...args) => {
    if (SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    } else {
      console.warn('[Preload] Blocked send on invalid channel:', channel);
    }
  },

  on: (channel, callback) => {
    if (ON_CHANNELS.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
    console.warn('[Preload] Blocked on() for invalid channel:', channel);
    return () => {};
  },

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  clipboard: {
    writeText: (text) => clipboard.writeText(text)
  }
});
