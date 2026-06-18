// 文件日志模块
// Hook console.log/error/warn，输出同时写入终端和文件
// 无第三方依赖，仅使用 fs/path/util

const fs = require('fs');
const path = require('path');
const util = require('util');

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB 轮转
let logPath = '';

// 安装 console hook（必须尽早调用，不依赖 app.whenReady）
function initLogger() {
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;

  function writeLog(level, args) {
    const ts = new Date().toISOString();
    const msg = '[' + ts + '] [' + level + '] ' + util.format(...args);
    // 终端
    if (level === 'ERROR') origError(msg);
    else if (level === 'WARN') origWarn(msg);
    else origLog(msg);
    // 文件（logPath 在 app.whenReady 之后通过 setLogPath 设置）
    if (!logPath) return;
    try {
      try {
        const st = fs.statSync(logPath);
        if (st.size > MAX_LOG_SIZE) {
          const oldPath = logPath.replace(/\.log$/, '.old.log');
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          fs.renameSync(logPath, oldPath);
        }
      } catch {}
      fs.appendFileSync(logPath, msg + '\n', 'utf-8');
    } catch {}
  }

  console.log = (...args) => writeLog('LOG', args);
  console.error = (...args) => writeLog('ERROR', args);
  console.warn = (...args) => writeLog('WARN', args);
}

// app.whenReady 之后调用，设置日志文件路径
function setLogPath(userDataPath) {
  if (!userDataPath) return;
  const dir = path.join(userDataPath, 'logs');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { return; }
  logPath = path.join(dir, 'app.log');
}

function getLogPath() { return logPath; }

function readLastLines(n, search) {
  if (!logPath) return [];
  try {
    if (!fs.existsSync(logPath)) return [];
    const content = fs.readFileSync(logPath, 'utf-8');
    let lines = content.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    if (search && search.trim()) {
      const kw = search.trim().toLowerCase();
      lines = lines.filter(l => l.toLowerCase().includes(kw));
    }
    return lines.slice(-Math.abs(n || 200));
  } catch { return []; }
}

function clearLogs() {
  if (!logPath) return;
  try { fs.writeFileSync(logPath, '', 'utf-8'); } catch {}
}

module.exports = { initLogger, setLogPath, getLogPath, readLastLines, clearLogs };
