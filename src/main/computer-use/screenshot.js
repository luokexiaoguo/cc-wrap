const sharp = require('sharp');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function captureWithPowerShell(displayIndex) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `screenshot_${Date.now()}.png`);

    const idx = typeof displayIndex === 'number' ? displayIndex : 0;

    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $screens = [System.Windows.Forms.Screen]::AllScreens
      $target = $screens[${idx}]
      if ($null -eq $target) { $target = $screens[0] }
      $bounds = $target.Bounds
      $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bmp.Size)
      $dpiX = $g.DpiX
      $g.Dispose()
      $scaleFactor = [math]::Round($dpiX / 96, 2)
      $bmp.Save('${tempFile.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
      $bmp.Dispose()
      Write-Output "$($bounds.Width),$($bounds.Height),$scaleFactor"
    `;

    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      timeout: 10000,
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }

      try {
        const pngBuffer = fs.readFileSync(tempFile);
        try { fs.unlinkSync(tempFile); } catch {}

        const parts = stdout.trim().split(',').map(s => s.trim());
        const logicalW = parseInt(parts[0]) || 1920;
        const logicalH = parseInt(parts[1]) || 1080;
        const scaleFactor = parseFloat(parts[2]) || 1;

        resolve({
          buffer: pngBuffer,
          logicalWidth: logicalW,
          logicalHeight: logicalH,
          scaleFactor,
        });
      } catch (readErr) {
        reject(new Error('读取截图文件失败: ' + readErr.message));
      }
    });
  });
}

async function captureScreen(options = {}) {
  const { display_index, region, quality = 75 } = options;

  const { buffer: pngBuffer, logicalWidth, logicalHeight, scaleFactor } =
    await captureWithPowerShell(display_index);

  let pipeline = sharp(pngBuffer);

  const pngMeta = await sharp(pngBuffer).metadata();
  const physicalWidth = pngMeta.width;
  const physicalHeight = pngMeta.height;

  if (region) {
    const pixelRatio = physicalWidth / logicalWidth;
    const left = Math.max(0, Math.round(region.x * pixelRatio));
    const top = Math.max(0, Math.round(region.y * pixelRatio));
    const width = Math.min(Math.round(region.width * pixelRatio), physicalWidth - left);
    const height = Math.min(Math.round(region.height * pixelRatio), physicalHeight - top);
    if (width > 0 && height > 0) {
      pipeline = pipeline.extract({ left, top, width, height });
    }
  }

  const jpegBuffer = await pipeline
    .jpeg({ quality: Math.max(1, Math.min(100, quality)) })
    .toBuffer();

  const finalMeta = await sharp(jpegBuffer).metadata();

  return {
    image: jpegBuffer.toString('base64'),
    width: region ? Math.round(finalMeta.width * logicalWidth / physicalWidth) : logicalWidth,
    height: region ? Math.round(finalMeta.height * logicalHeight / physicalHeight) : logicalHeight,
    physicalWidth,
    physicalHeight,
    scaleFactor,
  };
}

module.exports = { captureScreen };
