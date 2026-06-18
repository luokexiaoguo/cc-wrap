// mouse.js — 鼠标键盘控制模块（PowerShell + .NET，无需原生模块）
const { execFile } = require('child_process');

/**
 * 执行 PowerShell 脚本
 * @param {string} script - PowerShell 脚本内容
 * @returns {Promise<string>} stdout
 */
function execPS(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      timeout: 10000,
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

/**
 * 验证坐标在屏幕范围内
 * @param {number} x
 * @param {number} y
 */
function validateCoords(x, y) {
  if (typeof x !== 'number' || typeof y !== 'number') {
    throw new Error('坐标必须是数字');
  }
  if (x < 0 || y < 0) {
    throw new Error('坐标不能为负数');
  }
}

/**
 * 移动鼠标到指定位置
 * @param {number} x
 * @param {number} y
 */
async function moveMouse(x, y) {
  validateCoords(x, y);
  await execPS(`
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})
  `);
}

/**
 * 点击鼠标
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @param {string} [button='left'] - 鼠标按钮: left/right/middle
 * @param {number} [clickCount=1] - 点击次数
 */
async function click(x, y, button = 'left', clickCount = 1) {
  validateCoords(x, y);

  // 先移动鼠标
  await moveMouse(x, y);
  await sleep(50);

  // 构建点击脚本
  const btnFlag = button === 'right' ? 0x0008 : button === 'middle' ? 0x0020 : 0x0002;
  const downFlag = btnFlag;
  const upFlag = btnFlag * 2; // MOUSEEVENTF_xxxUP = MOUSEEVENTF_xxx * 2 对于 left=0x0002, right=0x0008

  // 使用 mouse_event API
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
"@
    $down = ${downFlag}
    $up = ${upFlag}
    for ($i = 0; $i -lt ${clickCount}; $i++) {
      [MouseOps]::mouse_event($down, 0, 0, 0, 0)
      [MouseOps]::mouse_event($up, 0, 0, 0, 0)
      if ($i -lt ${clickCount - 1}) { Start-Sleep -Milliseconds 50 }
    }
  `;

  await execPS(script);
}

/**
 * 右键点击
 * @param {number} x
 * @param {number} y
 */
async function rightClick(x, y) {
  await click(x, y, 'right', 1);
}

/**
 * 双击
 * @param {number} x
 * @param {number} y
 */
async function doubleClick(x, y) {
  await click(x, y, 'left', 2);
}

/**
 * 滚动鼠标滚轮
 * @param {number} x - 位置 X
 * @param {number} y - 位置 Y
 * @param {string} direction - 滚动方向: up/down
 * @param {number} [amount=3] - 滚动量（行数）
 */
async function scroll(x, y, direction, amount = 3) {
  validateCoords(x, y);
  await moveMouse(x, y);
  await sleep(50);

  const delta = direction === 'up' ? amount * 120 : -amount * 120;
  await execPS(`
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ScrollOps {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
}
"@
    [ScrollOps]::mouse_event(0x0800, 0, 0, ${delta}, 0)
  `);
}

/**
 * 拖拽
 * @param {number} fromX - 起始 X
 * @param {number} fromY - 起始 Y
 * @param {number} toX - 目标 X
 * @param {number} toY - 目标 Y
 * @param {string} [button='left'] - 鼠标按钮
 */
async function drag(fromX, fromY, toX, toY, button = 'left') {
  validateCoords(fromX, fromY);
  validateCoords(toX, toY);

  const btnDown = button === 'right' ? 0x0008 : 0x0002;
  const btnUp = button === 'right' ? 0x0010 : 0x0004;

  // 移动到起点 → 按下 → 移动到终点 → 释放
  await moveMouse(fromX, fromY);
  await sleep(50);

  await execPS(`
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DragOps {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
}
"@
    [DragOps]::mouse_event(${btnDown}, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 100
    [DragOps]::SetCursorPos(${Math.round(toX)}, ${Math.round(toY)})
    Start-Sleep -Milliseconds 100
    [DragOps]::mouse_event(${btnUp}, 0, 0, 0, 0)
  `);
}

/**
 * 输入文字（通过剪贴板粘贴，支持中文）
 * @param {string} text - 要输入的文字
 * @param {boolean} [pressEnter=false] - 是否按回车
 */
async function typeText(text, pressEnter = false) {
  // 使用剪贴板粘贴方案，兼容中文输入法
  const escaped = text.replace(/'/g, "''");
  let script = `
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Clipboard]::SetText('${escaped}')
    Start-Sleep -Milliseconds 50
    [System.Windows.Forms.SendKeys]::SendWait('^v')
  `;

  if (pressEnter) {
    script += `\nStart-Sleep -Milliseconds 50\n[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')`;
  }

  await execPS(script);
}

/**
 * 按快捷键
 * @param {string} keyCombo - 如 "ctrl+c", "ctrl+shift+s", "alt+f4"
 */
async function pressKeys(keyCombo) {
  // 解析快捷键
  const parts = keyCombo.toLowerCase().split('+').map(s => s.trim());
  const modifiers = [];
  let key = '';

  for (const part of parts) {
    switch (part) {
      case 'ctrl': case 'control': modifiers.push('^'); break;
      case 'alt': modifiers.push('%'); break;
      case 'shift': modifiers.push('+'); break;
      default: key = part;
    }
  }

  // 映射特殊键
  const keyMap = {
    enter: '{ENTER}', return: '{ENTER}', tab: '{TAB}', escape: '{ESC}', esc: '{ESC}',
    backspace: '{BACKSPACE}', delete: '{DELETE}', del: '{DELETE}',
    up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
    home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}',
    f1: '{F1}', f2: '{F2}', f3: '{F3}', f4: '{F4}', f5: '{F5}', f6: '{F6}',
    f7: '{F7}', f8: '{F8}', f9: '{F9}', f10: '{F10}', f11: '{F11}', f12: '{F12}',
    space: ' ', insert: '{INS}',
  };

  const sendKey = keyMap[key] || key;
  const combo = modifiers.join('') + sendKey;

  await execPS(`
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait('${combo}')
  `);
}

/**
 * 获取当前鼠标位置
 * @returns {Promise<{ x: number, y: number }>}
 */
async function getMousePosition() {
  const result = await execPS(`
    Add-Type -AssemblyName System.Windows.Forms
    $pos = [System.Windows.Forms.Cursor]::Position
    "$($pos.X),$($pos.Y)"
  `);
  const [x, y] = result.split(',').map(Number);
  return { x, y };
}

/**
 * 延迟
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  moveMouse,
  click,
  rightClick,
  doubleClick,
  scroll,
  drag,
  typeText,
  pressKeys,
  getMousePosition,
};
