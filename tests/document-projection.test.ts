import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import PizZip from 'pizzip';
import * as CFB from 'cfb';
import ExcelJS from 'exceljs';
import * as XLS from '@e965/xlsx';
import { afterEach, describe, expect, it } from 'vitest';
import { documentProjectionService } from '../src/rdc/document-projection/service.js';
import {
  isZipSymlink,
  sanitizeArchivePath,
} from '../src/rdc/document-projection/helpers.js';
import { readFileFromDisk } from '../src/rdc/tools/filesystem.js';

const roots: string[] = [];

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-document-projection-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function pptxFixture(): Buffer {
  const zip = new PizZip();
  zip.file('ppt/presentation.xml',
    '<p:presentation xmlns:p="urn:p" xmlns:r="urn:r"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="urn:slide" Target="slides/slide1.xml"/>'
    + '</Relationships>');
  zip.file('ppt/slides/slide1.xml',
    '<p:sld xmlns:p="urn:p" xmlns:a="urn:a" xmlns:r="urn:r" xmlns:c="urn:c" xmlns:asvg="urn:asvg">'
    + '<p:cSld><p:spTree>'
    + '<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Deck title</a:t></a:r></a:p></p:txBody></p:sp>'
    + '<p:grpSp><p:sp><p:txBody><a:p><a:r><a:t>Grouped text</a:t></a:r></a:p></p:txBody></p:sp></p:grpSp>'
    + '<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>H1</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>H2</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:p><a:r><a:t>A</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>B</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>'
    + '<p:graphicFrame><a:graphic><a:graphicData><c:chart r:id="rIdChart"/></a:graphicData></a:graphic></p:graphicFrame>'
    + '<p:pic><p:nvPicPr><p:cNvPr name="Vector" descr="Vector alt"/></p:nvPicPr><p:blipFill><a:blip><a:extLst><a:ext><asvg:svgBlip r:embed="rIdSvg"/></a:ext></a:extLst></a:blip></p:blipFill></p:pic>'
    + '</p:spTree></p:cSld></p:sld>');
  zip.file('ppt/slides/_rels/slide1.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rIdChart" Type="urn:chart" Target="../charts/chart1.xml"/>'
    + '<Relationship Id="rIdSvg" Type="urn:image" Target="../media/image1.svg"/>'
    + '<Relationship Id="rIdNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>'
    + '</Relationships>');
  zip.file('ppt/charts/chart1.xml',
    '<c:chartSpace xmlns:c="urn:c" xmlns:a="urn:a"><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Revenue</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:ser><c:tx><c:strRef><c:strCache><c:pt><c:v>Sales</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strLit><c:pt><c:v>2026</c:v></c:pt></c:strLit></c:cat><c:val><c:numLit><c:pt><c:v>42</c:v></c:pt></c:numLit></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>');
  zip.file('ppt/notesSlides/notesSlide1.xml',
    '<p:notes xmlns:p="urn:p" xmlns:a="urn:a"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Speaker note</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>');
  zip.file('ppt/media/image1.svg', '<svg xmlns="http://www.w3.org/2000/svg"><text>vector</text></svg>');
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function epubFixture(): Buffer {
  const zip = new PizZip();
  zip.file('META-INF/container.xml',
    '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
  zip.file('OEBPS/content.opf',
    '<package xmlns:dc="urn:dc"><metadata><dc:title>Book title</dc:title><dc:creator>Author</dc:creator><dc:description>Book description</dc:description></metadata>'
    + '<manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>'
    + '<spine><itemref idref="c1"/></spine></package>');
  zip.file('OEBPS/chapter.xhtml', '<html><body><h1>Chapter One</h1><p>Hello <strong>world</strong>.</p></body></html>');
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function notebookFixture(): Buffer {
  return Buffer.from(JSON.stringify({
    nbformat: 4,
    metadata: { kernelspec: { language: 'python' } },
    cells: [
      { cell_type: 'markdown', source: ['# Notebook title'] },
      { cell_type: 'code', source: ['print("ok")\n'], outputs: [{ output_type: 'stream', text: 'not executed' }] },
    ],
  }), 'utf8');
}
function msgFixture(): Buffer {
  const cfb = CFB.utils.cfb_new();
  const props = Buffer.alloc(48);
  props.writeUInt32LE((0x3ffd << 16) | 0x0003, 32);
  props.writeUInt32LE(1252, 40);
  CFB.utils.cfb_add(cfb, '__properties_version1.0', props);
  const addUnicode = (tag: string, value: string) => {
    CFB.utils.cfb_add(cfb, '__substg1.0_' + tag + '001F', Buffer.from(value + '\0', 'utf16le'));
  };
  addUnicode('0C1F', 'sender@example.test');
  addUnicode('0E04', 'recipient@example.test');
  addUnicode('0037', 'Subject line');
  addUnicode('1000', 'Message body');
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }));
}

function nestedZipFixture(): Buffer {
  const zip = new PizZip();
  zip.file('page.html', '<html><body><h1>Archive page</h1><p>Body</p></body></html>');
  zip.file('notes.ipynb', notebookFixture());
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function oneEntryZip(name = 'safe.txt', content: Buffer | string = 'safe'): Buffer {
  const zip = new PizZip();
  zip.file(name, content);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function replaceEqualLength(buffer: Buffer, from: string, to: string): Buffer {
  expect(Buffer.byteLength(from)).toBe(Buffer.byteLength(to));
  const out = Buffer.from(buffer);
  const needle = Buffer.from(from);
  let offset = 0;
  while ((offset = out.indexOf(needle, offset)) >= 0) {
    Buffer.from(to).copy(out, offset);
    offset += needle.length;
  }
  return out;
}

function markZipEncrypted(buffer: Buffer): Buffer {
  const out = Buffer.from(buffer);
  for (let offset = 0; offset + 10 < out.length; offset += 1) {
    const signature = out.readUInt32LE(offset);
    if (signature === 0x04034b50) out.writeUInt16LE(out.readUInt16LE(offset + 6) | 1, offset + 6);
    if (signature === 0x02014b50) out.writeUInt16LE(out.readUInt16LE(offset + 8) | 1, offset + 8);
  }
  return out;
}

function markZipSymlink(buffer: Buffer): Buffer {
  const out = Buffer.from(buffer);
  for (let offset = 0; offset + 42 < out.length; offset += 1) {
    if (out.readUInt32LE(offset) !== 0x02014b50) continue;
    out.writeUInt16LE((3 << 8) | 20, offset + 4);
    out.writeUInt32LE((0o120777 << 16) >>> 0, offset + 38);
  }
  return out;
}

describe('MarkItDown-derived native document projection', () => {
  it('projects PPTX slide order, groups, tables, charts, notes, alt text, and SVG-only images automatically', async () => {
    const root = await fixtureRoot();
    const file = path.join(root, 'deck.pptx');
    await writeFile(file, pptxFixture());
    const result = await readFileFromDisk(file);
    const text = String(result.content);
    expect(result.metadata?.isDocumentProjection).toBe(true);
    expect(result.metadata?.sourceFormat).toBe('pptx');
    expect(text).toContain('<!-- Slide number: 1 -->');
    expect(text).toContain('# Deck title');
    expect(text).toContain('Grouped text');
    expect(text).toContain('| H1 | H2 |');
    expect(text).toContain('### Chart: Revenue');
    expect(text).toContain('| 2026 | 42 |');
    expect(text).toContain('### Notes:\nSpeaker note');
    expect(text).toContain('![Vector alt](embedded:image1.svg)');
  });

  it('projects EPUB, IPYNB, and Outlook MSG without executing embedded content', async () => {
    const root = await fixtureRoot();
    const inputs: Array<[string, Buffer, string[]]> = [
      ['book.epub', epubFixture(), ['**Title:** Book title', '# Chapter One', '**world**']],
      ['work.ipynb', notebookFixture(), ['# Notebook title', 'print("ok")']],
      ['mail.msg', msgFixture(), ['**From:** sender@example.test', '**Subject:** Subject line', 'Message body']],
    ];
    for (const [name, bytes, expected] of inputs) {
      const file = path.join(root, name);
      await writeFile(file, bytes);
      const result = await readFileFromDisk(file);
      expect(result.metadata?.isDocumentProjection).toBe(true);
      for (const value of expected) expect(String(result.content)).toContain(value);
    }
    expect(String((await readFileFromDisk(path.join(root, 'work.ipynb'))).content)).not.toContain('not executed');
  });
  it('keeps native HTML reading by default but supports explicit HTML/RSS/CSV markdown and legacy charset evidence', async () => {
    const root = await fixtureRoot();
    const htmlFile = path.join(root, 'page.html');
    await writeFile(htmlFile, '<html><body><h1>Local title</h1></body></html>', 'utf8');
    const native = await readFileFromDisk(htmlFile);
    expect(native.metadata?.isDocumentProjection).not.toBe(true);
    expect(String(native.content)).toContain('<h1>Local title</h1>');

    const markdown = await readFileFromDisk(htmlFile, { projection: 'markdown' });
    expect(markdown.metadata?.isDocumentProjection).toBe(true);
    expect(String(markdown.content)).toContain('# Local title');

    const remoteHtml = await documentProjectionService.projectBytes({
      bytes: Buffer.from('<html><body><a href="../story">Story</a></body></html>'),
      profile: 'markdown',
      sourceName: 'page.html',
      url: 'https://example.test/base/page.html',
      mimeType: 'text/html',
    });
    expect(remoteHtml?.markdown).toContain('https://example.test/story');

    const rss = Buffer.from('<rss xml:base="https://example.test/base/"><channel><title>Feed</title><item><title>Item</title><description><![CDATA[<a href="story">Read</a>]]></description></item></channel></rss>');
    const feed = await documentProjectionService.projectBytes({ bytes: rss, profile: 'markdown', sourceName: 'feed.xml' });
    expect(feed?.markdown).toContain('# Feed');
    expect(feed?.markdown).toContain('https://example.test/base/story');
    const cp932 = Buffer.from('lryRTyyUTpfuLI9aj4oNCo2yk6GRvphZLDMwLJOMi54NCo5PltiJcI5xLDI1LJHljeMNCu7gi7SPfiwzNSyWvIzDia4NCg==', 'base64');
    const csv = await documentProjectionService.projectBytes({ bytes: cp932, profile: 'markdown', sourceName: 'legacy.csv' });
    expect(csv?.markdown).toContain('| 名前 | 年齢 | 住所 |');
    expect(csv?.markdown).toContain('| 佐藤太郎 | 30 | 東京 |');
  });

  it('recursively projects ZIP members while refusing traversal and symlink evidence', async () => {
    const root = await fixtureRoot();
    const file = path.join(root, 'bundle.zip');
    await writeFile(file, nestedZipFixture());
    const result = await readFileFromDisk(file);
    const text = String(result.content);
    expect(result.metadata?.isDocumentProjection).toBe(true);
    expect(text).toContain('## File: page.html');
    expect(text).toContain('# Archive page');
    expect(text).toContain('## File: notes.ipynb');
    expect(text).toContain('# Notebook title');

    let traversal: unknown;
    try {
      sanitizeArchivePath('../escape.txt');
    } catch (error) {
      traversal = error;
    }
    expect(traversal).toMatchObject({
      code: 'DOCUMENT_PROJECTION_ARCHIVE_TRAVERSAL_REFUSED',
      message: 'Document projection refused unsafe input.',
    });
    expect(isZipSymlink(0o120777 << 16)).toBe(true);
  });

  it('fails closed on traversal, encrypted, symlink, and compression-bomb-like ZIP inputs', async () => {
    const root = await fixtureRoot();
    const cases: Array<[string, Buffer, string]> = [
      [
        'traversal.zip',
        replaceEqualLength(oneEntryZip('safe.txt'), 'safe.txt', '../a.txt'),
        'DOCUMENT_PROJECTION_ARCHIVE_TRAVERSAL_REFUSED',
      ],
      [
        'encrypted.zip',
        markZipEncrypted(oneEntryZip()),
        'DOCUMENT_PROJECTION_ARCHIVE_ENCRYPTED',
      ],
      [
        'symlink.zip',
        markZipSymlink(oneEntryZip()),
        'DOCUMENT_PROJECTION_ARCHIVE_SYMLINK_REFUSED',
      ],
      [
        'oversized-member.zip',
        oneEntryZip('large.txt', Buffer.alloc(8 * 1024 * 1024 + 1, 0x41)),
        'DOCUMENT_PROJECTION_ARCHIVE_MEMBER_TOO_LARGE',
      ],
    ];

    for (const [name, bytes, code] of cases) {
      const file = path.join(root, name);
      await writeFile(file, bytes);
      let caught: unknown;
      try {
        await readFileFromDisk(file);
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code });
      expect(String((caught as Error).message)).toBe('Document projection refused unsafe input.');
    }
  });

  it('keeps existing XLSX native mode and exposes markdown only when explicitly requested', async () => {
    const root = await fixtureRoot();
    const file = path.join(root, 'sheet.xlsx');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.addRow(['Name', 'Value']);
    sheet.addRow(['Alpha', 42]);
    await workbook.xlsx.writeFile(file);
    const native = await readFileFromDisk(file);
    expect(native.metadata?.isExcelFile).toBe(true);
    expect(native.metadata?.isDocumentProjection).not.toBe(true);
    expect(String(native.content)).toContain('[["Name","Value"],["Alpha",42]]');

    const projected = await readFileFromDisk(file, { projection: 'markdown' });
    expect(projected.metadata?.isDocumentProjection).toBe(true);
    expect(String(projected.content)).toContain('| Name | Value |');
    expect(String(projected.content)).toContain('| Alpha | 42 |');

    const legacyFile = path.join(root, 'legacy.xls');
    const legacyWorkbook = XLS.utils.book_new();
    XLS.utils.book_append_sheet(
      legacyWorkbook,
      XLS.utils.aoa_to_sheet([['Legacy', 'Value'], ['Beta', 7]]),
      'Legacy Data',
    );
    await writeFile(legacyFile, Buffer.from(XLS.write(legacyWorkbook, { type: 'buffer', bookType: 'xls' })));
    const legacyProjected = await readFileFromDisk(legacyFile, { projection: 'markdown' });
    expect(legacyProjected.metadata?.sourceFormat).toBe('xls');
    expect(String(legacyProjected.content)).toContain('## Legacy Data');
    expect(String(legacyProjected.content)).toContain('| Beta | 7 |');
  });

  it('retains immutable input bytes, falls back between eligible converters, and sanitizes aggregate failures', async () => {
    const htmlBytes = Buffer.from('<rss><broken><h1>Fallback heading</h1>');
    const before = createHash('sha256').update(htmlBytes).digest('hex');
    const projected = await documentProjectionService.projectBytes({
      bytes: htmlBytes,
      profile: 'markdown',
      sourceName: 'fallback.html',
      mimeType: 'text/html',
    });
    const after = createHash('sha256').update(htmlBytes).digest('hex');
    expect(after).toBe(before);
    expect(projected?.markdown).toContain('Fallback heading');

    const root = await fixtureRoot();
    const malformed = path.join(root, 'private-deck-name.pptx');
    await writeFile(malformed, Buffer.from('not a zip'));
    let caught: unknown;
    try {
      await readFileFromDisk(malformed);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(String((caught as Error).message)).toContain('Document semantic projection failed');
    expect(String((caught as Error).message)).not.toContain('private-deck-name');
  });
});
