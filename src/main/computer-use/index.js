const { captureScreen } = require('./screenshot');
const { click, rightClick, doubleClick, scroll, drag, typeText, pressKeys, getMousePosition, moveMouse } = require('./mouse');
const { getPrimaryDisplay, getAllDisplays } = require('./display');

const TOOL_DEFINITIONS = [
  {
    name: 'ComputerScreenshot',
    description: 'Capture a screenshot of the screen. Returns a base64-encoded JPEG image that you can analyze visually. Use this to see the current screen state before performing GUI actions, and to verify results after actions. The returned image dimensions are in logical pixels (matching the coordinate system used by click/scroll/drag). On high-DPI displays, the actual image resolution may be higher than the reported logical dimensions.',
    input_schema: {
      type: 'object',
      properties: {
        display_index: { type: 'number', description: 'Monitor index (0 = primary). Default: 0.' },
        region: {
          type: 'object',
          description: 'Crop region in logical pixels { x, y, width, height }. Omit for full screen capture.',
          properties: {
            x: { type: 'number', description: 'Left edge in logical pixels' },
            y: { type: 'number', description: 'Top edge in logical pixels' },
            width: { type: 'number', description: 'Width in logical pixels' },
            height: { type: 'number', description: 'Height in logical pixels' },
          },
        },
        quality: { type: 'number', description: 'JPEG quality 1-100. Default: 75. Lower values save tokens; higher values preserve detail.' },
      },
      required: [],
    },
  },
  {
    name: 'ComputerClick',
    description: 'Click the mouse at the specified screen coordinates. Coordinates are in logical pixels with the top-left corner at (0, 0). IMPORTANT: Always take a screenshot first to identify the correct coordinates before clicking. The coordinate system matches the dimensions reported by ComputerScreenshot (logical pixels, not physical pixels).',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in logical pixels' },
        y: { type: 'number', description: 'Y coordinate in logical pixels' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button. Default: "left".' },
        click_count: { type: 'number', description: 'Number of clicks: 1 = single click, 2 = double click. Default: 1.' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'ComputerType',
    description: 'Type text or execute keyboard shortcuts. For text input: uses clipboard paste (supports Chinese and all Unicode). For shortcuts: use the keys parameter with "+" joining modifiers, e.g. "ctrl+c", "ctrl+shift+s", "alt+f4". Do NOT use both text and keys in the same call.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type (via clipboard paste). Mutually exclusive with keys.' },
        keys: { type: 'string', description: 'Keyboard shortcut, e.g. "ctrl+s", "alt+f4", "ctrl+shift+n". Mutually exclusive with text.' },
        press_enter: { type: 'boolean', description: 'Whether to press Enter after typing text. Default: false.' },
      },
      required: [],
    },
  },
  {
    name: 'ComputerScroll',
    description: 'Scroll the mouse wheel at a specific position. Move the cursor to (x, y) first, then scroll. Coordinates are in logical pixels.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate to scroll at (logical pixels)' },
        y: { type: 'number', description: 'Y coordinate to scroll at (logical pixels)' },
        direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction: "up" or "down".' },
        amount: { type: 'number', description: 'Scroll amount in lines. Default: 3. Use larger values (5-10) for faster scrolling.' },
      },
      required: ['x', 'y', 'direction'],
    },
  },
  {
    name: 'ComputerDrag',
    description: 'Drag from one coordinate to another (press mouse at start, move, release at end). Coordinates are in logical pixels. Use for dragging windows, selecting text, moving sliders, etc.',
    input_schema: {
      type: 'object',
      properties: {
        from_x: { type: 'number', description: 'Start X coordinate (logical pixels)' },
        from_y: { type: 'number', description: 'Start Y coordinate (logical pixels)' },
        to_x: { type: 'number', description: 'End X coordinate (logical pixels)' },
        to_y: { type: 'number', description: 'End Y coordinate (logical pixels)' },
        button: { type: 'string', enum: ['left', 'right'], description: 'Mouse button. Default: "left".' },
      },
      required: ['from_x', 'from_y', 'to_x', 'to_y'],
    },
  },
];

async function handleComputerScreenshot(input, ctx) {
  try {
    const { modelSupportsVision } = require('../api-client');
    const model = ctx.apiConfig?.model || '';
    const supportsVision = modelSupportsVision(model);
    console.log(`[ComputerScreenshot] model=${model}, supportsVision=${supportsVision}`);

    if (!supportsVision) {
      return { error: `Model "${model}" does not support image input. ComputerScreenshot requires a vision-capable model (e.g. Claude, GPT-4o, Gemini). Please switch to a vision model to use Computer Use.` };
    }

    const result = await captureScreen({
      display_index: input.display_index,
      region: input.region,
      quality: input.quality,
    });

    console.log(`[ComputerScreenshot] captured: ${result.width}x${result.height} (logical), ${result.physicalWidth}x${result.physicalHeight} (physical), scale=${result.scaleFactor}, base64=${result.image.length}`);

    return {
      content: result.image,
      isImage: true,
      width: result.width,
      height: result.height,
      scaleFactor: result.scaleFactor,
    };
  } catch (err) {
    console.error(`[ComputerScreenshot] failed:`, err);
    return { error: 'Screenshot failed: ' + err.message };
  }
}

async function handleComputerClick(input, ctx) {
  try {
    const { x, y, button = 'left', click_count = 1 } = input;
    if (click_count === 2) {
      await doubleClick(x, y);
    } else if (button === 'right') {
      await rightClick(x, y);
    } else {
      await click(x, y, button, click_count);
    }
    return { content: `Clicked at (${x}, ${y}) with ${button} button, ${click_count} time(s)` };
  } catch (err) {
    return { error: 'Click failed: ' + err.message };
  }
}

async function handleComputerType(input, ctx) {
  try {
    if (input.keys) {
      await pressKeys(input.keys);
      return { content: `Key shortcut executed: ${input.keys}` };
    } else if (input.text) {
      await typeText(input.text, input.press_enter);
      const preview = input.text.length > 50 ? input.text.substring(0, 50) + '...' : input.text;
      return { content: `Text typed: "${preview}"${input.press_enter ? ' + Enter' : ''}` };
    }
    return { error: 'Provide either "text" or "keys" parameter.' };
  } catch (err) {
    return { error: 'Type failed: ' + err.message };
  }
}

async function handleComputerScroll(input, ctx) {
  try {
    const { x, y, direction, amount = 3 } = input;
    await scroll(x, y, direction, amount);
    return { content: `Scrolled ${direction} ${amount} lines at (${x}, ${y})` };
  } catch (err) {
    return { error: 'Scroll failed: ' + err.message };
  }
}

async function handleComputerDrag(input, ctx) {
  try {
    const { from_x, from_y, to_x, to_y, button = 'left' } = input;
    await drag(from_x, from_y, to_x, to_y, button);
    return { content: `Dragged from (${from_x}, ${from_y}) to (${to_x}, ${to_y}) with ${button} button` };
  } catch (err) {
    return { error: 'Drag failed: ' + err.message };
  }
}

const TOOL_HANDLERS = {
  ComputerScreenshot: handleComputerScreenshot,
  ComputerClick: handleComputerClick,
  ComputerType: handleComputerType,
  ComputerScroll: handleComputerScroll,
  ComputerDrag: handleComputerDrag,
};

const COMPUTER_USE_TOOL_NAMES = Object.keys(TOOL_HANDLERS);

module.exports = {
  screenshot: { captureScreen },
  mouse: { click, rightClick, doubleClick, scroll, drag, typeText, pressKeys, getMousePosition, moveMouse },
  display: { getPrimaryDisplay, getAllDisplays },
  TOOL_DEFINITIONS,
  TOOL_HANDLERS,
  COMPUTER_USE_TOOL_NAMES,
};
