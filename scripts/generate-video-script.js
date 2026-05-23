const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  Header, Footer, PageNumber
} = require('docx');

async function main() {
  const mdPath = path.resolve(__dirname, 'video-script-content.md');
  const script = fs.readFileSync(mdPath, 'utf-8');
  const lines = script.trim().split('\n');

  const doc = new Document({
    title: 'cc-wrap 视频文案',
    description: 'cc-wrap Claude Code Desktop 视频推广文案',
    styles: {
      default: {
        document: {
          run: {
            font: 'Microsoft YaHei',
            size: 22,
            color: '1f1a15',
          },
          paragraph: {
            spacing: { after: 120 },
          },
        },
      },
    },
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'cc-wrap 视频文案 · 机密', font: 'Microsoft YaHei', size: 18, color: '999999' }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: '第 ', size: 18 }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18 }),
                  new TextRun({ text: ' 页', size: 18 }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: generateContent(lines),
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.resolve(__dirname, '..', 'cc-wrap-视频文案.docx');
  fs.writeFileSync(outPath, buffer);
  console.log('✅ 文档已生成: ' + outPath);
}

function generateContent(lines) {
  const children = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Headings
    if (line.startsWith('# ') || line.startsWith('## ') || line.startsWith('### ') || line.startsWith('#### ')) {
      const level = line.match(/^#+/)[0].length;
      let text = line.replace(/^#+\s*/, '').replace(/[*`]/g, '');
      // Remove ** markers
      text = text.replace(/\*\*/g, '');

      const sizes = [36, 30, 26, 24];
      children.push(
        new Paragraph({
          heading: [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][level - 1],
          spacing: { before: level === 1 ? 400 : 240, after: 200 },
          children: [
            new TextRun({
              text,
              bold: true,
              size: sizes[level - 1] || 24,
              color: level === 1 ? '1f1a15' : 'd97757',
            }),
          ],
        })
      );
      i++;
      continue;
    }

    // Scene description lines starting with >
    if (line.trim().startsWith('>')) {
      const text = line.trim().replace(/^>\s*/, '');
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          indent: { left: 360 },
          children: [
            new TextRun({
              text,
              italics: true,
              size: 20,
              color: '7a6b56',
            }),
          ],
        })
      );
      i++;
      continue;
    }

    // Bullet points
    if (line.trim().match(/^[-*]\s/)) {
      const text = line.trim().replace(/^[-*]\s/, '');
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: 720 },
          bullet: { level: 0 },
          children: parseInline(text),
        })
      );
      i++;
      continue;
    }

    // Numbered list
    if (line.trim().match(/^\d+[\.。]\s/)) {
      const text = line.trim().replace(/^\d+[\.。]\s/, '');
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: 720 },
          children: parseInline(text),
        })
      );
      i++;
      continue;
    }

    // Table row
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const cells = line.trim().split('|').filter(c => c.trim()).map(c => c.trim());
      const rows = [cells];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i].trim();
        if (nextLine.startsWith('|') && nextLine.endsWith('|')) {
          if (nextLine.match(/^[|].*[-]+.*[|]/)) { i++; continue; }
          rows.push(nextLine.split('|').filter(c => c.trim()).map(c => c.trim()));
          i++;
        } else break;
      }

      const tableRows = rows.map((row, idx) => {
        return new TableRow({
          tableHeader: idx === 0,
          children: row.map(cellText => {
            return new TableCell({
              shading: idx === 0 ? { type: ShadingType.SOLID, color: 'f5f1eb', fill: 'f5f1eb' } : undefined,
              children: [
                new Paragraph({
                  spacing: { before: 40, after: 40 },
                  children: [
                    new TextRun({
                      text: cellText,
                      bold: idx === 0,
                      size: 20,
                      color: idx === 0 ? 'd97757' : '1f1a15',
                    }),
                  ],
                }),
              ],
            });
          }),
        });
      });

      children.push(
        new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'd9cdb7' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'd9cdb7' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'd9cdb7' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'd9cdb7' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'd9cdb7' },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'd9cdb7' },
          },
        }),
        new Paragraph({ spacing: { after: 200 }, children: [] })
      );
      continue;
    }

    // Regular paragraph
    if (line.trim()) {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 80 },
          children: parseInline(line.trim()),
        })
      );
      i++;
      continue;
    }

    i++;
  }

  return children;
}

function parseInline(text) {
  const runs = [];
  const regex = /\*\*(.*?)\*\*|`(.*?)`|(\s+)/g;
  let lastIndex = 0;

  const parts = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    if (match[1]) parts.push({ type: 'bold', value: match[1] });
    else if (match[2]) parts.push({ type: 'code', value: match[2] });
    else if (match[3]) parts.push({ type: 'text', value: match[3] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  for (const part of parts) {
    if (part.type === 'bold') {
      runs.push(new TextRun({ text: part.value, bold: true, size: 22 }));
    } else if (part.type === 'code') {
      runs.push(new TextRun({ text: part.value, font: 'JetBrains Mono', size: 20, color: 'c96442' }));
    } else {
      runs.push(new TextRun({ text: part.value, size: 22 }));
    }
  }

  return runs;
}

main().catch(console.error);
