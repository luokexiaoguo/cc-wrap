// MCP (Model Context Protocol) 客户端
// 通过 stdio 与 MCP 服务器通信（JSON-RPC 2.0）

const { spawn } = require('child_process');
const readline = require('readline');

const CONNECT_TIMEOUT = 10000;
const CALL_TIMEOUT = 60000;
const MAX_RECONNECT = 2;

class McpClient {
  constructor(serverConfig) {
    this.name = serverConfig.name;
    this.command = serverConfig.command;
    this.args = serverConfig.args || [];
    this.cwd = serverConfig.cwd || undefined;
    this.env = { ...process.env, ...(serverConfig.env || {}) };

    this.process = null;
    this.requestId = 0;
    this.pending = new Map(); // id -> { resolve, reject, timer }
    this.tools = [];
    this.connected = false;
    this.reconnectCount = 0;
    this._onStderr = null;
  }

  /**
   * 连接到 MCP 服务器：spawn 进程 + initialize 握手
   */
  async connect() {
    if (this.connected) return;

    try {
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

      // 读取 stderr 用于调试
      if (this.process.stderr) {
        const stderrRl = readline.createInterface({ input: this.process.stderr });
        stderrRl.on('line', (line) => {
          if (this._onStderr) this._onStderr(line);
        });
      }

      // 读取 stdout 按行解析 JSON-RPC 消息
      const rl = readline.createInterface({ input: this.process.stdout });
      rl.on('line', (line) => this._onLine(line));

      // MCP initialize 握手
      await this._sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'cc-wrap', version: '1.0.0' },
      });

      // 发送 initialized 通知
      this._sendNotification('notifications/initialized', {});

      // 获取工具列表
      const toolsResult = await this._sendRequest('tools/list', {});
      this.tools = toolsResult.tools || [];
      this.connected = true;
      this.reconnectCount = 0;

      console.log(`[MCP] ${this.name} 已连接, ${this.tools.length} 个工具`);
    } catch (err) {
      this._cleanup();
      throw new Error(`MCP 连接失败 (${this.name}): ${err.message}`);
    }
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

    // MCP 工具结果格式化
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

  // ========== 内部方法 ==========

  _onLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const msg = JSON.parse(trimmed);

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
      // JSON-RPC 通知（服务端推送，无 id）— 忽略
    } catch {
      // 非 JSON 行，忽略（可能是日志输出）
    }
  }

  _sendRequest(method, params) {
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

  _sendNotification(method, params) {
    if (!this.process || !this.process.stdin || this.process.stdin.destroyed) return;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    try { this.process.stdin.write(msg); } catch {}
  }

  _cleanup() {
    this.connected = false;
    // 拒绝所有 pending 请求
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('MCP 连接已断开'));
    }
    this.pending.clear();
    // 关闭进程
    if (this.process) {
      try { this.process.stdin.end(); } catch {}
      try { this.process.kill(); } catch {}
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
  getServerStatuses,
  closeAll,
  getClient,
  clients,
};
