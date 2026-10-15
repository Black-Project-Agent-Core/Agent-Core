import type { ArtifactFinding } from './contracts.js';

const invalid = () => { throw new Error('ARTIFACT_MANAGED_METADATA_INVALID'); };
export function inspectManaged(bytes: Uint8Array): { findings: ArtifactFinding[]; limitations: string[] } {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const results: ArtifactFinding[] = [];
  const limitations = ['PE/CLI metadata declarations only: no CLR load, CIL, native export resolution, or runtime inference'];
  const within = (off: number, n: number) => Number.isSafeInteger(off) && off >= 0 && n >= 0 && off + n <= b.length;
  const u16 = (o: number) => within(o, 2) ? b.readUInt16LE(o) : invalid();
  const u32 = (o: number) => within(o, 4) ? b.readUInt32LE(o) : invalid();
  const u64 = (o: number) => { if (!within(o, 8)) return invalid(); const n = b.readBigUInt64LE(o); return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : invalid(); };
  const emit = (kind: string, summary: string, offset: number) => {
    if (results.length < 256) results.push({ id: 'm' + results.length, kind,
      classification: 'observed', summary: summary.slice(0, 220), source: 'managed-pe', offset });
  };
  if (!within(0, 64) || u16(0) !== 0x5a4d) return invalid();
  const pe = u32(0x3c);
  if (!within(pe, 24) || u32(pe) !== 0x4550) return invalid();
  const machine = u16(pe + 4), sectionCount = u16(pe + 6), optionalSize = u16(pe + 20);
  const optional = pe + 24, magic = u16(optional);
  if (magic !== 0x10b && magic !== 0x20b) return invalid();
  const directoryStart = optional + (magic === 0x20b ? 112 : 96);
  if (!within(optional, optionalSize) || !within(directoryStart + 14 * 8, 8)) return invalid();
  const cliRva = u32(directoryStart + 14 * 8);
  if (!cliRva) throw new Error('ARTIFACT_MANAGED_CLI_ABSENT');
  const sections: Array<{ v: number; length: number; file: number; bytes: number }> = [];
  for (let i = 0; i < sectionCount; i++) {
    const o = optional + optionalSize + i * 40;
    if (!within(o, 40)) return invalid();
    sections.push({ v: u32(o + 12), length: u32(o + 8), file: u32(o + 20), bytes: u32(o + 16) });
  }
  const atRva = (rva: number, length = 1): number => {
    const s = sections.find(v => rva >= v.v && rva + length <= v.v + v.bytes
      && rva + length <= v.v + Math.max(v.length, v.bytes));
    if (!s) return invalid();
    const off = s.file + rva - s.v;
    return within(off, length) ? off : invalid();
  };
  const cli = atRva(cliRva, 72), flags = u32(cli + 16);
  const metadata = atRva(u32(cli + 8), u32(cli + 12));
  if (u32(metadata) !== 0x424a5342) return invalid();
  emit('pe-header', 'machine=0x' + machine.toString(16) + ' cliFlags=0x' + flags.toString(16)
    + ' readyToRun-unknown', pe);
  let cur = metadata + 12;
  const versionBytes = u32(cur); cur += 4 + ((versionBytes + 3) & ~3);
  const streams = u16(cur + 2); cur += 4;
  const tableStreams = new Map<string, { offset: number; size: number }>();
  for (let i = 0; i < streams; i++) {
    const o = u32(cur), size = u32(cur + 4);
    let nameEnd = cur + 8;
    while (within(nameEnd, 1) && b[nameEnd] !== 0 && nameEnd < cur + 8 + 32) nameEnd++;
    if (!within(nameEnd, 1) || nameEnd >= cur + 8 + 32) return invalid();
    const name = b.toString('ascii', cur + 8, nameEnd);
    if (!within(metadata + o, size)) return invalid();
    tableStreams.set(name, { offset: metadata + o, size });
    cur += 8 + ((nameEnd - (cur + 8) + 1 + 3) & ~3);
  }
  const table = tableStreams.get('#~') ?? tableStreams.get('#-');
  if (!table || table.size < 24 || !within(table.offset, table.size)) return invalid();
  const str = tableStreams.get('#Strings'), guid = tableStreams.get('#GUID'), blob = tableStreams.get('#Blob');
  if (!str || !guid || !blob) return invalid();
  const strAt = (index: number) => {
    if (index <= 0 || index >= str.size) return '';
    const pos = str.offset + index;
    let end = pos;
    while (end < str.offset + str.size && b[end] !== 0 && end - pos < 300) end++;
    return b.toString('utf8', pos, end);
  };
  const guidAt = (index: number) => {
    if (index <= 0) return '';
    const pos = guid.offset + (index - 1) * 16;
    return within(pos, 16) && pos + 16 <= guid.offset + guid.size ? b.subarray(pos, pos + 16).toString('hex') : '';
  };
  const valid = b.readBigUInt64LE(table.offset + 8);
  const declaredTables = valid.toString(2).replace(/0/g, '').length;
  if (table.size < 24 + declaredTables * 4) return invalid();
  const heapFlags = b[table.offset + 6]!;
  const rows = new Array<number>(64).fill(0);
  let counts = table.offset + 24;
  for (let i = 0; i < 64; i++) if ((valid >> BigInt(i)) & 1n) { rows[i] = u32(counts); counts += 4; }
  const h = (bit: number) => heapFlags & bit ? 4 : 2;
  const S = h(1), G = h(2), B = h(4);
  const idx = (id: number) => (rows[id] ?? 0) >= 65536 ? 4 : 2;
  const coded = (ids: number[], tagBits: number) => Math.max(...ids.map(v => rows[v] ?? 0)) >= (1 << (16 - tagBits)) ? 4 : 2;
  const td = coded([1,2,27],2), rs = coded([0,26,35,1],2);
  const mrp = coded([2,1,26,6,27],3), hcst = coded([4,8,23],2);
  const hca = coded([6,4,1,2,8,9,10,0,14,23,20,17,26,27,32,35,38,39,40,42,44,43],5);
  const caType = coded([6,10],3), marshal = coded([4,8],1), decl = coded([2,6,32],2);
  const semantics = coded([20,23],1), methodRef = coded([6,10],1);
  const implementation = coded([38,35,39],2), owner = coded([2,6],1);
  const field = idx(4), method = idx(6), param = idx(8);
  // ECMA-335 table row widths, including unselected tables needed for safe offsets.
  const sizes = [
    2+S+G*3, rs+S*2, 4+S*2+td+field+method, field, 2+S+B, method,
    4+2+2+S+B+param, param, 2+2+S, idx(2)+td, mrp+S+B,
    2+hcst+B, hca+caType+B, marshal+B, 2+decl+B, 2+4+idx(2),
    4+field, B, idx(2)+idx(20), idx(20), 2+S+td,
    idx(2)+idx(23), idx(23), 2+S+B, 2+method+semantics,
    idx(2)+methodRef*2, S, B, 2+coded([4,6],1)+S+idx(26), 4+field, 8,
    4, 16+B+S*2, 4, 12, 12+B*2+S*2,
    4+idx(35), 12+idx(35), 4+S+B, 8+S*2+implementation,
    8+S+implementation, idx(2)*2, 4+owner+S, methodRef+B,
    idx(42)+td,
  ];
  const starts = new Array<number>(64).fill(0);
  let start = counts;
  for (let i = 0; i < 64; i++) {
    starts[i] = start;
    const count = rows[i] ?? 0;
    if (count && (!sizes[i] || count > 250000)) return invalid();
    start += count * (sizes[i] ?? 0);
    if (start > table.offset + table.size) return invalid();
  }
  const indexVal = (o: number, size: number) => size === 4 ? u32(o) : u16(o);
  if (rows[0]) { const o = starts[0]; const mvid = indexVal(o + 2 + S, G);
    emit('module', 'name=' + strAt(indexVal(o + 2, S)) + ' MVID=' + guidAt(mvid), o); }
  if (rows[32]) { const o = starts[32];
    emit('assembly', 'version=' + [u16(o+4),u16(o+6),u16(o+8),u16(o+10)].join('.')
      + ' name=' + strAt(indexVal(o+16+B,S)), o); }
  for (let i = 0; i < Math.min(rows[35] ?? 0, 80); i++) {
    const o = starts[35] + i * sizes[35]!;
    emit('assembly-ref', 'name=' + strAt(indexVal(o + 12 + B, S))
      + ' version=' + [u16(o),u16(o+2),u16(o+4),u16(o+6)].join('.'), o);
  }
  for (let i = 0; i < Math.min(rows[26] ?? 0, 80); i++) {
    const o = starts[26] + i * sizes[26]!;
    emit('module-ref', 'module=' + strAt(indexVal(o,S)), o);
  }
  // Field and MethodDef are declarations only. Never infer runtime binding or execution.
  for (let i = 0; i < Math.min(rows[4] ?? 0, 64); i++) {
    const o = starts[4] + i * sizes[4]!;
    emit('field-declaration', 'token=0x' + (0x04000000 + i + 1).toString(16)
      + ' flags=0x' + u16(o).toString(16)
      + ' name=' + strAt(indexVal(o + 2, S)) + ' declaration-only', o);
  }
  for (let i = 0; i < Math.min(rows[6] ?? 0, 64); i++) {
    const o = starts[6] + i * sizes[6]!;
    emit('method-declaration', 'token=0x' + (0x06000000 + i + 1).toString(16)
      + ' flags=0x' + u16(o + 6).toString(16)
      + ' implFlags=0x' + u16(o + 4).toString(16)
      + ' rva=0x' + u32(o).toString(16)
      + ' name=' + strAt(indexVal(o + 8, S)) + ' declaration-only', o);
  }
  const memberForwarded = coded([4,6],1);
  for (let i=0; i<Math.min(rows[28] ?? 0, 128); i++) {
    const o=starts[28]+i*sizes[28]!;
    const flags = u16(o), forwarded = indexVal(o+2,memberForwarded);
    const name = strAt(indexVal(o+2+memberForwarded,S));
    const scope = indexVal(o+2+memberForwarded+S,idx(26));
    emit('pinvoke-declaration','ImplMap flags=0x'+flags.toString(16)+' member='+forwarded+
      ' import='+name+' moduleRefRow='+scope+' declaration-only',o);
  }
  limitations.push('Unselected metadata tables and member bodies not examined');
  return { findings: results, limitations };
}