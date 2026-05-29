const fs = require('fs');
const path = require('path');
const os = require('os');

// 创建临时测试目录
const tmpDir = path.join(os.tmpdir(), 'cc-wrap-test-' + Date.now());
beforeAll(() => { fs.mkdirSync(tmpDir, { recursive: true }); });
afterAll(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

// 由于 tool-executor 依赖 electron-store 等模块，我们直接测试可提取的纯函数
// 这里测试 readTextSmart、readDocx、readExcel、readCsv 等

const iconv = require('iconv-lite');
const zlib = require('zlib');
const XLSX = require('xlsx');

// 复制 tool-executor 中的纯函数用于测试
function readTextSmart(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf-8');
  }
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return iconv.decode(buf.slice(2), 'utf-16le');
  }
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    return iconv.decode(buf.slice(2), 'utf-16be');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (_) {
    try { return iconv.decode(buf, 'gbk'); }
    catch (_) { return buf.toString('latin1'); }
  }
}

function readDocx(filePath) {
  const zipBuf = fs.readFileSync(filePath);
  const eocdOffset = zipBuf.lastIndexOf(Buffer.from('PK\x05\x06'));
  if (eocdOffset === -1) return '[无法解析 docx]';
  const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);
  let pos = cdOffset;
  while (pos < eocdOffset) {
    if (zipBuf.readUInt32LE(pos) !== 0x02014b50) break;
    const compMethod = zipBuf.readUInt16LE(pos + 10);
    const compSize = zipBuf.readUInt32LE(pos + 20);
    const nameLen = zipBuf.readUInt16LE(pos + 28);
    const extraLen = zipBuf.readUInt16LE(pos + 30);
    const commentLen = zipBuf.readUInt16LE(pos + 32);
    const localHeaderOffset = zipBuf.readUInt32LE(pos + 42);
    const name = zipBuf.slice(pos + 46, pos + 46 + nameLen).toString('utf-8');
    if (name === 'word/document.xml') {
      const lNameLen = zipBuf.readUInt16LE(localHeaderOffset + 26);
      const dataOffset = localHeaderOffset + 30 + lNameLen;
      const dataBuf = zipBuf.slice(dataOffset, dataOffset + compSize);
      let xmlBuf;
      if (compMethod === 8) xmlBuf = zlib.inflateRawSync(dataBuf);
      else if (compMethod === 0) xmlBuf = dataBuf;
      else return '[不支持压缩方法]';
      const xml = xmlBuf.toString('utf-8');
      const lines = [];
      const paragraphs = xml.split(/<w:p[\s>]/);
      for (let i = 1; i < paragraphs.length; i++) {
        const texts = [];
        const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let m;
        while ((m = re.exec(paragraphs[i])) !== null) texts.push(m[1]);
        const line = texts.join('');
        if (line.trim()) lines.push(line);
      }
      return lines.join('\n');
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return '[未找到document.xml]';
}

function readExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const results = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (data.length === 0) continue;
    results.push('## Sheet: ' + name);
    const header = data[0].map(c => String(c).trim());
    results.push('| ' + header.join(' | ') + ' |');
    results.push('| ' + header.map(() => '---').join(' | ') + ' |');
    for (let i = 1; i < data.length; i++) {
      const row = data[i].map(c => String(c).trim());
      while (row.length < header.length) row.push('');
      results.push('| ' + row.join(' | ') + ' |');
    }
  }
  return results.join('\n');
}

function readCsv(filePath) {
  const raw = readTextSmart(filePath);
  const lines = raw.split('\n').filter(l => l.trim());
  if (lines.length === 0) return '[CSV 无数据]';
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = [];
    let cell = '', inQuote = false;
    for (let j = 0; j < lines[i].length; j++) {
      const ch = lines[i][j];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === sep && !inQuote) { cells.push(cell.trim()); cell = ''; }
      else { cell += ch; }
    }
    cells.push(cell.trim());
    if (i === 0) {
      results.push('| ' + cells.join(' | ') + ' |');
      results.push('| ' + cells.map(() => '---').join(' | ') + ' |');
    } else {
      results.push('| ' + cells.join(' | ') + ' |');
    }
  }
  return results.join('\n');
}

describe('readTextSmart', () => {
  test('读取 UTF-8 文件', () => {
    const fp = path.join(tmpDir, 'utf8.txt');
    fs.writeFileSync(fp, '你好世界', 'utf-8');
    expect(readTextSmart(fp)).toBe('你好世界');
  });

  test('读取 GBK 文件', () => {
    const fp = path.join(tmpDir, 'gbk.txt');
    fs.writeFileSync(fp, iconv.encode('你好世界', 'gbk'));
    expect(readTextSmart(fp)).toBe('你好世界');
  });

  test('读取 UTF-8 BOM 文件', () => {
    const fp = path.join(tmpDir, 'bom.txt');
    const buf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('hello', 'utf-8')]);
    fs.writeFileSync(fp, buf);
    expect(readTextSmart(fp)).toBe('hello');
  });
});

describe('readExcel', () => {
  test('读取 xlsx 返回 Markdown 表格', () => {
    const fp = path.join(tmpDir, 'test.xlsx');
    const wb = XLSX.utils.book_new();
    const data = [['姓名', '年龄'], ['张三', 28], ['李四', 35]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Sheet1');
    XLSX.writeFile(wb, fp);

    const result = readExcel(fp);
    expect(result).toContain('## Sheet: Sheet1');
    expect(result).toContain('| 姓名 | 年龄 |');
    expect(result).toContain('| 张三 | 28 |');
    expect(result).toContain('| 李四 | 35 |');
  });

  test('读取多 Sheet Excel', () => {
    const fp = path.join(tmpDir, 'multi.xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['A', 'B'], [1, 2]]), '第一表');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['X', 'Y'], [3, 4]]), '第二表');
    XLSX.writeFile(wb, fp);

    const result = readExcel(fp);
    expect(result).toContain('## Sheet: 第一表');
    expect(result).toContain('## Sheet: 第二表');
  });
});

describe('readCsv', () => {
  test('读取逗号分隔 CSV', () => {
    const fp = path.join(tmpDir, 'comma.csv');
    fs.writeFileSync(fp, '姓名,年龄\n张三,28\n李四,35', 'utf-8');

    const result = readCsv(fp);
    expect(result).toContain('| 姓名 | 年龄 |');
    expect(result).toContain('| 张三 | 28 |');
  });

  test('读取制表符分隔 CSV', () => {
    const fp = path.join(tmpDir, 'tab.csv');
    fs.writeFileSync(fp, '姓名\t年龄\n张三\t28', 'utf-8');

    const result = readCsv(fp);
    expect(result).toContain('| 姓名 | 年龄 |');
    expect(result).toContain('| 张三 | 28 |');
  });
});
