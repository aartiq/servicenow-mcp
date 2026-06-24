import { contextBridge, ipcRenderer } from 'electron';

/**
 * Expose a safe, typed API to the renderer process.
 * The renderer calls window.api.* — no direct Node.js access.
 */
contextBridge.exposeInMainWorld('api', {
  // ── Config ──
  getConfig: (key: string) => ipcRenderer.invoke('config:get', key),
  setConfig: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value),
  getAllConfig: () => ipcRenderer.invoke('config:getAll'),

  // ── Instances ──
  listInstances: () => ipcRenderer.invoke('instances:list'),
  addInstance: (instance: unknown) => ipcRenderer.invoke('instances:add', instance),
  removeInstance: (name: string) => ipcRenderer.invoke('instances:remove', name),
  testInstance: (instance: unknown) => ipcRenderer.invoke('instances:test', instance),

  // ── Server ──
  startServer: (instanceName?: string) => ipcRenderer.invoke('server:start', instanceName),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  getServerStatus: () => ipcRenderer.invoke('server:status'),

  // ── Tools ──
  listTools: () => ipcRenderer.invoke('tools:list'),
  executeTool: (name: string, args: Record<string, unknown>) =>
    ipcRenderer.invoke('tools:execute', name, args),

  // ── Audit ──
  getAuditLogs: (limit?: number) => ipcRenderer.invoke('audit:getLogs', limit),

  // ── System ──
  getVersion: () => ipcRenderer.invoke('system:getVersion'),
  openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
  selectDirectory: () => ipcRenderer.invoke('system:selectDirectory'),
  getServerPath: () => ipcRenderer.invoke('system:getServerPath'),

  // ── AI Chat ──
  sendChat: (params: unknown) => ipcRenderer.invoke('chat:send', params),
});
