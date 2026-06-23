// MCP (Model Context Protocol) 客户端
// 支持 stdio（子进程 stdin/stdout）和 HTTP/SSE（Streamable HTTP）传输

const { spawn } = require('child_process');
const readline = require('readline');
let treeKill = null;
try { treeKill = require('tree-kill'); } catch {}

const CONNECT_TIMEOUT = 15000;
const CALL_TIMEOUT = 60000;
const MAX_RECONNECT = 2;

class McpClient {
  constructor(serverConfig) {
    this.name = serverConfig.name;
    this.command = serverConfig.command;
    this.args = serverConfig.args || [];
    this.cwd = serverConfig.cwd || undefined;
    this.env = { ...process.env, ...(serverConfig.env || {}) };

    // 检测传输类型：command 以 http:// 或 https:// 开头 => HTTP/SSE 模式
    this.isHttp = typeof this.command === 'string' &&
      (this.command.startsWith('http://') || this.command.startsWith('https://'));

    // HTTP 传输状态
    this.httpUrl = this.isHttp ? new URL(this.command) : null;
    this.messageUrl = null;     // 从 SSE endpoint 事件获取
    this.sessionId = null;      // 从 initialize 响应获取
    this._abortController = null;
    this._sseReader = null;
    this._sseClosed = false;

    // stdio 传输状态
    this.process = null;

    // 通用状态
    this.requestId = 0;
    this.pending = new Map();   // id -> { resolve, reject, timer }
    this.tools = [];
    this.connected = false;
    this.reconnectCount = 0;
    this._onStderr = null;
  }

  /**
   * 连接到 MCP 服务器
   */
  async connect() {
    if (this.connected) return;

    try {
      if (this.isHttp) {
        await this._connectHttp();
      } else {
        await this._connectStdio();
      }
    } catch (err) {
      this._cleanup();
      throw new Error(`MCP 连接失败 (${this.name}): ${err.message}`);
    }
  }

  // ========== stdio 传输实现 ==========

  async _connectStdio() {
    this.process = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    this.process.on('error', (err) => {
      console.error(`[MCP] ${this.name} 进程错误:`, err.message);
      this._cleanup();
    });

    this.process.on('exit', (code) => {
      console.log(`[MCP] ${this.name} 进程退出 (code=${code})`);
      this._cleanup();
      this._tryReconnect();
    });

    if (this.process.stderr) {
      const stderrRl = readline.createInterface({ input: this.process.stderr });
      stderrRl.on('line', (line) => {
        if (this._onStderr) this._onStderr(line);
      });
    }

    const rl = readline.createInterface({ input: this.process.stdout });
    rl.on('line', (line) => this._onLine(line));

    await this._performHandshake();
  }

  // ========== HTTP/SSE 传输实现 ==========

  async _connectHttp() {
    const url = this.httpUrl.toString();
    const abortController = new AbortController();
    this._abortController = abortController;
    this._sseClosed = false;

    // 尝试 GET 建立 SSE 流（标准 Streamable HTTP 模式）
    let getResponse;
    try {
      getResponse = await fetch(url, {
        headers: { 'Accept': 'application/json, text/event-stream' },
        signal: abortController.signal,
      });
    } catch (err) {
      // GET 失败（如 405 Method Not Allowed）=> 回退到 POST-only 模式
      getResponse = null;
    }

    const contentType = getResponse && getResponse.ok ? (getResponse.headers.get('content-type') || '') : '';

    if (contentType.includes('text/event-stream')) {
      // 模式 A: GET → SSE 流（含 endpoint 事件）
      const reader = getResponse.body.getReader();
      this._sseReader = reader;
      const decoder = new TextDecoder();
      let buffer = '';
      let foundEndpoint = false;

      while (!foundEndpoint) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        buffer = buffer.replace(/\r\n/g, '\n');
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          const lines = event.split('\n');
          let eventType = '';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              dataStr = line.slice(6);
            }
          }
          if (eventType === 'endpoint' && dataStr) {
            const ep = dataStr.trim();
            if (ep.startsWith('/')) {
              this.messageUrl = new URL(ep, url).toString();
            } else if (ep.startsWith('http://') || ep.startsWith('https://')) {
              this.messageUrl = ep;
            } else {
              this.messageUrl = url.replace(/\/+$/, '') + '/' + ep.replace(/^\//, '');
            }
            foundEndpoint = true;
            break;
          }
        }
      }

      if (!this.messageUrl) {
        this.messageUrl = url.replace(/\/+$/, '') + '/message';
      }

      // 启动后台 SSE 监听
      this._startSseListener(reader, decoder);
    } else {
      // 模式 B: POST-only（所有请求 POST 到同一 URL，响应以 SSE 或 JSON 返回）
      // 常见于 Tavily 等现代 MCP HTTP 服务器
      this.messageUrl = url;
      this._postOnly = true;
    }

    // 握手
    await this._performHandshake();
  }

  _startSseListener(reader, decoder) {
    let buffer = '';
    const pump = async () => {
      try {
        while (!this._sseClosed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          buffer = buffer.replace(/\r\n/g, '\n');
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const event of events) {
            const dataMatch = event.match(/data: (.+)/s);
            if (!dataMatch) continue;
            try {
              const msg = JSON.parse(dataMatch[1]);
              this._onMessage(msg);
            } catch {}
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(`[MCP] ${this.name} SSE 读取错误:`, err.message);
        }
      }
    };
    pump();
  }

  // ========== 通用握手流程 ==========

  async _performHandshake() {
    // initialize
    const initResult = await this._sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'cc-wrap', version: '1.0.0' },
    });

    // 保存 sessionId（HTTP 模式需要回传）
    if (initResult && initResult.sessionId) {
      this.sessionId = initResult.sessionId;
    }

    // initialized 通知（fire-and-forget）
    this._sendNotification('notifications/initialized', {});

    // 获取工具列表
    const toolsResult = await this._sendRequest('tools/list', {});
    this.tools = toolsResult.tools || [];
    this.connected = true;
    this.reconnectCount = 0;

    const mode = this.isHttp ? 'HTTP' : 'stdio';
    console.log(`[MCP] ${this.name} (${mode}) 已连接, ${this.tools.length} 个工具`);
  }

  /**
   * 获取工具定义（转换为 Anthropic 格式）
   */
  getToolDefinitions() {
    return this.tools.map((tool) => ({
      name: tool.name,
      description: (tool.description || '') + ` [MCP: ${this.name}]`,
      input_schema: tool.inputSchema || { type: 'object', properties: {} },
    }));
  }

  /**
   * 调用 MCP 工具
   */
  async callTool(name, args) {
    if (!this.connected) throw new Error(`MCP 服务器 ${this.name} 未连接`);

    const result = await this._sendRequest('tools/call', {
      name,
      arguments: args || {},
    });

    if (result.isError) {
      const content = result.content || [];
      const text = content.map((c) => c.text || JSON.stringify(c)).join('\n');
      throw new Error(text || 'MCP 工具调用失败');
    }

    const content = result.content || [];
    const text = content.map((c) => {
      if (c.type === 'text') return c.text;
      if (c.type === 'image') return `[图片: ${c.mimeType || 'unknown'}]`;
      return JSON.stringify(c);
    }).join('\n');

    return text;
  }

  /**
   * 关闭连接
   */
  close() {
    this.reconnectCount = MAX_RECONNECT; // 阻止重连
    this._cleanup();
  }

  // ========== 发送请求（统一入口） ==========

  _sendRequest(method, params) {
    if (this.isHttp) {
      return this._sendRequestHttp(method, params);
    }
    return this._sendRequestStdio(method, params);
  }

  // ========== stdio 请求 ==========

  _sendRequestStdio(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin || this.process.stdin.destroyed) {
        return reject(new Error('MCP 进程未运行'));
      }

      const id = ++this.requestId;
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP 请求超时: ${method}`));
      }, method === 'initialize' ? CONNECT_TIMEOUT : CALL_TIMEOUT);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.process.stdin.write(msg);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  // ========== HTTP 请求 ==========

  async _sendRequestHttp(method, params) {
    const id = ++this.requestId;
    const body = { jsonrpc: '2.0', id, method, params };

    // sessionId 附加到 URL
    let url = this.messageUrl.toString();
    if (this.sessionId) {
      const sep = url.includes('?') ? '&' : '?';
      url += sep + 'sessionId=' + encodeURIComponent(this.sessionId);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
      signal: this._abortController.signal,
    });

    // 202 Accepted — 服务端将通过 SSE 推送结果
    if (response.status === 202) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`MCP 请求超时: ${method}`));
        }, method === 'initialize' ? CONNECT_TIMEOUT : CALL_TIMEOUT);
        this.pending.set(id, { resolve, reject, timer });
      });
    }

    const contentType = response.headers.get('content-type') || '';

    // SSE 响应 — 流式解析，匹配对应 id
    if (contentType.includes('text/event-stream')) {
      return this._readSseResponse(response, id, method);
    }

    // JSON 响应
    const result = await response.json();
    if (result.error) {
      throw new Error(result.error.message || JSON.stringify(result.error));
    }
    return result.result;
  }

  async _readSseResponse(response, targetId, method) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reader.cancel();
        reject(new Error(`MCP SSE 响应超时: ${method}`));
      }, CALL_TIMEOUT);

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              reject(new Error('SSE 流提前结束'));
              return;
            }
            buffer += decoder.decode(value, { stream: true });

            buffer = buffer.replace(/\r\n/g, '\n');
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (const event of events) {
              const dataMatch = event.match(/data: (.+)/s);
              if (!dataMatch) continue;
              try {
                const msg = JSON.parse(dataMatch[1]);
                if (msg.id === targetId) {
                  clearTimeout(timer);
                  reader.cancel();
                  if (msg.error) {
                    reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                  } else {
                    resolve(msg.result);
                  }
                  return;
                }
                // 其他消息（如 notifications）也馈入主处理器
                if (msg.id !== undefined) {
                  this._onMessage(msg);
                }
              } catch {}
            }
          }
        } catch (err) {
          clearTimeout(timer);
          reject(err);
        }
      };
      pump();
    });
  }

  // ========== 通知 ==========

  _sendNotification(method, params) {
    if (this.isHttp) {
      // fire-and-forget POST
      const body = { jsonrpc: '2.0', method, params };
      let url = this.messageUrl.toString();
      if (this.sessionId) {
        const sep = url.includes('?') ? '&' : '?';
        url += sep + 'sessionId=' + encodeURIComponent(this.sessionId);
      }
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify(body),
        signal: this._abortController.signal,
      }).catch(() => {});
      return;
    }

    // stdio fire-and-forget
    if (!this.process || !this.process.stdin || this.process.stdin.destroyed) return;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    try { this.process.stdin.write(msg); } catch {}
  }

  // ========== 内部方法 ==========

  _onLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const msg = JSON.parse(trimmed);
      this._onMessage(msg);
    } catch {
      // 非 JSON 行，忽略
    }
  }

  _onMessage(msg) {
    // JSON-RPC 响应（有 id 字段）
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.error) {
          p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          p.resolve(msg.result);
        }
      }
    }
    // JSON-RPC 通知（无 id）— 忽略
  }

  _cleanup() {
    this.connected = false;

    // 拒绝所有 pending 请求
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('MCP 连接已断开'));
    }
    this.pending.clear();

    // 关闭 SSE 流
    this._sseClosed = true;
    if (this._abortController) {
      try { this._abortController.abort(); } catch {}
      this._abortController = null;
    }
    this._sseReader = null;

    // 关闭 stdio 进程
    if (this.process) {
      try { this.process.stdin.end(); } catch {}
      const pid = this.process.pid;
      if (treeKill && pid) {
        try { treeKill(pid, 'SIGKILL'); } catch { try { this.process.kill(); } catch {} }
      } else {
        try { this.process.kill(); } catch {}
      }
      this.process = null;
    }
  }

  _tryReconnect() {
    if (this.reconnectCount >= MAX_RECONNECT) return;
    this.reconnectCount++;
    const delay = 1000 * this.reconnectCount;
    console.log(`[MCP] ${this.name} ${delay}ms 后重连 (第 ${this.reconnectCount} 次)...`);
    setTimeout(() => {
      this.connect().catch((err) => {
        console.error(`[MCP] ${this.name} 重连失败:`, err.message);
      });
    }, delay);
  }
}

// ========== 全局 MCP 管理 ==========

const clients = new Map(); // serverName -> McpClient

/**
 * 连接所有 MCP 服务器
 */
async function connectAllServers(serverConfigs) {
  const results = [];
  for (const config of serverConfigs) {
    const client = new McpClient(config);
    try {
      await client.connect();
      clients.set(config.name, client);
      results.push({
        name: config.name,
        status: 'connected',
        tools: client.getToolDefinitions().map((t) => t.name),
      });
    } catch (err) {
      results.push({
        name: config.name,
        status: 'error',
        error: err.message,
      });
    }
  }
  return results;
}

/**
 * 获取所有已连接的 MCP 工具定义
 */
function getAllMcpTools() {
  const tools = [];
  for (const [name, client] of clients) {
    if (client.connected) {
      tools.push(...client.getToolDefinitions());
    }
  }
  return tools;
}

/**
 * 获取 MCP 工具的执行处理器
 */
function getMcpToolHandler(toolName) {
  for (const [serverName, client] of clients) {
    if (client.connected) {
      const toolDef = client.tools.find((t) => t.name === toolName);
      if (toolDef) {
        return async (input) => {
          const result = await client.callTool(toolName, input);
          return { content: result };
        };
      }
    }
  }
  return null;
}

/**
 * 获取 MCP 工具的 schema
 */
function getMcpToolSchema(toolName) {
  for (const [serverName, client] of clients) {
    if (client.connected) {
      const toolDef = client.tools.find((t) => t.name === toolName);
      if (toolDef) {
        return toolDef;
      }
    }
  }
  return null;
}

/**
 * 获取连接状态
 */
function getServerStatuses() {
  const statuses = [];
  for (const [name, client] of clients) {
    statuses.push({
      name,
      connected: client.connected,
      toolCount: client.tools.length,
      tools: client.tools.map((t) => t.name),
    });
  }
  return statuses;
}

/**
 * 关闭所有连接
 */
function closeAll() {
  for (const [name, client] of clients) {
    client.close();
  }
  clients.clear();
}

/**
 * 获取单个客户端
 */
function getClient(serverName) {
  return clients.get(serverName) || null;
}

module.exports = {
  McpClient,
  connectAllServers,
  getAllMcpTools,
  getMcpToolHandler,
  getMcpToolSchema,
  getServerStatuses,
  closeAll,
  getClient,
  clients,
};
