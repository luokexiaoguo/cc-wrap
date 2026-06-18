// display.js — 获取显示器信息（Electron screen API）
const { screen } = require('electron');

/**
 * 获取主显示器信息
 * @returns {{ width: number, height: number, scaleFactor: number, bounds: { x, y, width, height } }}
 */
function getPrimaryDisplay() {
  const display = screen.getPrimaryDisplay();
  return {
    width: display.size.width,
    height: display.size.height,
    scaleFactor: display.scaleFactor,
    bounds: display.bounds,
  };
}

/**
 * 获取所有显示器信息
 * @returns {Array<{ index: number, width: number, height: number, scaleFactor: number, bounds: object }>}
 */
function getAllDisplays() {
  return screen.getAllDisplays().map((d, i) => ({
    index: i,
    width: d.size.width,
    height: d.size.height,
    scaleFactor: d.scaleFactor,
    bounds: d.bounds,
  }));
}

module.exports = { getPrimaryDisplay, getAllDisplays };
