import { mkdtemp, writeFile, rm, symlink, truncate, mkdir, rename } from 'node:fs/promises';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configManager } from '../src/rdc/config-manager.js';
import { createImageInspector } from '../src/rdc/tools/image-inspect.js';

const roots: string[] = [];
async function fixture(width = 101, height = 57) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-inspect-')); roots.push(root);
  const file = path.join(root, 'pixels.png');
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3; pixels[i] = x % 256; pixels[i + 1] = y % 256; pixels[i + 2] = (x ^ y) % 256;
  }
  await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toFile(file);
  return { root, file, pixels };
}
function metadata(result: any) { return JSON.parse(result.content.find((b: any) => b.type === 'text').text); }
async function decoded(result: any) {
  const block = result.content.find((b: any) => b.type === 'image');
  return sharp(Buffer.from(block.data, 'base64')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('image_inspect original pixel views', () => {
  it('returns a real image and exact source metadata without upscaling overview', async () => {
    const { file, pixels } = await fixture();
    const result = await createImageInspector()({ action: 'overview', path: file });
    expect(metadata(result)).toMatchObject({ original: { width: 101, height: 57 }, displayed: { width: 101, height: 57 }, sourceRect: { x: 0, y: 0, width: 101, height: 57 }, mimeType: 'image/png' });
    expect((await decoded(result)).data).toEqual(pixels);
  });
  it('maps nested crops through distinct axis ratios back to original pixels', async () => {
    const { file } = await fixture(2003, 1001); const inspect = createImageInspector();
    const overview = metadata(await inspect({ action: 'overview', path: file }));
    expect(overview.displayed.width).toBeLessThanOrEqual(1536);
    const first = metadata(await inspect({ action: 'crop', path: file, viewId: overview.viewId, rectangle: { x: 21, y: 17, width: 130, height: 110 } }));
    const nested = await inspect({ action: 'crop', path: file, viewId: first.viewId, rectangle: { x: 7, y: 9, width: 20, height: 15 } });
    const m = metadata(nested);
    const expected = await sharp(file).extract({ left: m.sourceRect.x, top: m.sourceRect.y, width: m.sourceRect.width, height: m.sourceRect.height }).removeAlpha().raw().toBuffer();
    expect((await decoded(nested)).data).toEqual(expected);
    expect(m.sourceRect.x).toBe(Math.floor(21 * 2003 / overview.displayed.width) + 7);
    expect(m.sourceRect.y).toBe(Math.floor(17 * 1001 / overview.displayed.height) + 9);
  });
  it('magnifies explicitly and maps a later crop through the magnified view', async () => {
    const { file } = await fixture(); const inspect = createImageInspector();
    const view = metadata(await inspect({ action: 'overview', path: file }));
    const zoomed = metadata(await inspect({ action: 'crop', path: file, viewId: view.viewId, rectangle: { x: 10, y: 5, width: 20, height: 10 }, zoom: 4 }));
    expect(zoomed.displayed).toEqual({ width: 80, height: 40 });
    expect(zoomed.interpolation).toBe('cubic');
    const nested = await inspect({ action: 'crop', path: file, viewId: zoomed.viewId, rectangle: { x: 4, y: 8, width: 8, height: 8 } });
    expect(metadata(nested).sourceRect).toEqual({ x: 11, y: 7, width: 2, height: 2 });
    expect((await decoded(nested)).data).toEqual(await sharp(file).extract({ left: 11, top: 7, width: 2, height: 2 }).raw().toBuffer());
  });
  it.each([1,2,3,4,5,6,7,8])('normalizes EXIF orientation %i before extraction', async orientation => {
    const { file } = await fixture(12, 8);
    const input = await sharp(file).withMetadata({ orientation }).png().toBuffer(); await writeFile(file, input);
    const inspect = createImageInspector(); const result = await inspect({ action: 'overview', path: file }); const m = metadata(result);
    expect((await decoded(result)).data).toEqual(await sharp(input).autoOrient().removeAlpha().raw().toBuffer());
    expect(m.original).toEqual(orientation >= 5 ? { width: 8, height: 12 } : { width: 12, height: 8 });
    const crop = await inspect({ action: 'crop', path: file, viewId: m.viewId, rectangle: { x: 1, y: 2, width: 3, height: 4 } });
    expect((await decoded(crop)).data).toEqual(await sharp(input).autoOrient().extract({ left: 1, top: 2, width: 3, height: 4 }).removeAlpha().raw().toBuffer());
  });
  it('rejects changed sources, foreign views and expired views', async () => {
    const { file } = await fixture(); const inspect = createImageInspector(); const view = metadata(await inspect({ action: 'overview', path: file }));
    const args = { action: 'crop', path: file, viewId: view.viewId, rectangle: { x: 0, y: 0, width: 5, height: 5 } };
    await expect(createImageInspector()(args)).rejects.toThrow(/VIEW_NOT_FOUND/);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60_000);
    await expect(inspect(args)).rejects.toThrow(/VIEW_NOT_FOUND/); vi.restoreAllMocks();
    const second = metadata(await inspect({ action: 'overview', path: file }));
    await writeFile(file, await sharp({ create: { width: 101, height: 57, channels: 3, background: 'red' } }).png().toBuffer());
    await expect(inspect({ ...args, viewId: second.viewId })).rejects.toThrow(/SOURCE_CHANGED/);
  });
  it.each([{x:-1,y:0,width:1,height:1}, {x:100,y:0,width:2,height:1}, {x:0,y:0,width:0,height:1}, {x:NaN,y:0,width:1,height:1}])('rejects invalid rectangle %j', async rectangle => {
    const { file } = await fixture(); const inspect = createImageInspector(); const view = metadata(await inspect({ action: 'overview', path: file }));
    await expect(inspect({ action: 'crop', path: file, viewId: view.viewId, rectangle })).rejects.toThrow();
  });
  it('evicts old views at the per-session cap', async () => {
    const { file } = await fixture(2, 2); const inspect = createImageInspector(); const first = metadata(await inspect({ action: 'overview', path: file }));
    for (let i=0; i<64; i++) await inspect({ action: 'overview', path: file });
    await expect(inspect({ action: 'crop', path: file, viewId: first.viewId, rectangle: {x:0,y:0,width:1,height:1} })).rejects.toThrow(/VIEW_NOT_FOUND/);
  });
  it('refuses URLs, unsupported content, nonregular paths and oversized compressed input', async () => {
    const { root, file } = await fixture(); const inspect = createImageInspector();
    await expect(inspect({ action: 'overview', path: 'https://example.com/a.png' })).rejects.toThrow(/LOCAL_PATH/);
    await expect(inspect({ action: 'overview', path: root })).rejects.toThrow(/SAFE_REGULAR_FILE_REFUSED/);
    await writeFile(file, '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    await expect(inspect({ action: 'overview', path: file })).rejects.toThrow(/FORMAT/);
    await truncate(file, 32 * 1024 * 1024 + 1);
    await expect(inspect({ action: 'overview', path: file })).rejects.toThrow(/INPUT_LIMIT/);
  });
  it('honors canonical allowed paths and rejects symlink escapes or changed symlink targets', async () => {
    const { root, file } = await fixture(); const outside = await fixture(); const inspect = createImageInspector();
    const link = path.join(root, 'alias.png'); await symlink(file, link);
    vi.spyOn(configManager, 'getConfig').mockResolvedValue({ allowedDirectories: [root] });
    const view = metadata(await inspect({ action: 'overview', path: link }));
    await rm(link); await symlink(outside.file, link);
    await expect(inspect({ action: 'overview', path: link })).rejects.toThrow(/Path not allowed/);
    await expect(inspect({ action: 'crop', path: link, viewId: view.viewId, rectangle: {x:0,y:0,width:1,height:1} })).rejects.toThrow(/Path not allowed/);
    vi.restoreAllMocks();
    await expect(inspect({ action: 'crop', path: link, viewId: view.viewId, rectangle: {x:0,y:0,width:1,height:1} })).rejects.toThrow(/SOURCE_CHANGED/);
  });
  it('rejects animated PNG and WebP before decoding and bounds decoded pixels', async () => {
    const { file } = await fixture(); const inspect = createImageInspector();
    await writeFile(file, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.from([0,0,0,0]), Buffer.from('acTL'), Buffer.alloc(4)]));
    await expect(inspect({ action: 'overview', path: file })).rejects.toThrow(/ANIMATION/);
    await writeFile(file, Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBPANIM'),Buffer.alloc(4)]));
    await expect(inspect({ action: 'overview', path: file })).rejects.toThrow(/ANIMATION/);
    await sharp({create:{width:5000,height:5000,channels:3,background:'white'}}).png().toFile(file);
    await expect(inspect({ action: 'overview', path: file })).rejects.toThrow(/pixel limit|PIXEL_LIMIT/i);
  });
  it('rejects excessive encoded output without silently choosing lossy encoding', async () => {
    const { file } = await fixture(1,1); let seed=2463534242; const noise=Buffer.alloc(1000*800*3);
    for(let i=0;i<noise.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;noise[i]=seed&255;}
    await sharp(noise,{raw:{width:1000,height:800,channels:3}}).png().toFile(file);
    const inspect=createImageInspector();
    await expect(inspect({action:'overview',path:file})).rejects.toThrow(/OUTPUT_LIMIT/);
    const jpeg=await inspect({action:'overview',path:file,format:'jpeg'});
    expect(metadata(jpeg).fidelity).toContain('lossy');
    expect(jpeg.content.find(b=>b.type==='image')?.mimeType).toBe('image/jpeg');
  });
  it('caps process-wide operations without retaining a waiting queue', async () => {
    const { file } = await fixture(); const inspect=createImageInspector();
    const first=inspect({action:'overview',path:file}); const second=createImageInspector()({action:'overview',path:file});
    await expect(createImageInspector()({action:'overview',path:file})).rejects.toThrow(/BUSY/);
    await Promise.all([first,second]);
    expect(metadata(await inspect({action:'overview',path:file})).original.width).toBe(101);
  });
  it('rounds fractional rectangles outward and preserves both source axes after downscaling', async () => {
    const {file}=await fixture(2003,1001); const inspect=createImageInspector(); const v=metadata(await inspect({action:'overview',path:file}));
    const r={x:2.3,y:3.7,width:5.2,height:7.1};
    const m=metadata(await inspect({action:'crop',path:file,viewId:v.viewId,rectangle:r}));
    const x=Math.floor(r.x*2003/v.displayed.width), y=Math.floor(r.y*1001/v.displayed.height);
    expect(m.sourceRect).toEqual({x,y,width:Math.ceil((r.x+r.width)*2003/v.displayed.width)-x,height:Math.ceil((r.y+r.height)*1001/v.displayed.height)-y});
  });

  it('refuses high bit-depth input rather than silently quantizing detail', async () => {
    const {file}=await fixture(4,4);
    await writeFile(file,await sharp({create:{width:4,height:4,channels:3,background:'red'}}).toColourspace('rgb16').png().toBuffer());
    await expect(createImageInspector()({action:'overview',path:file})).rejects.toThrow(/BIT_DEPTH_UNSUPPORTED/);
  });

  it('does not lose exact source boundaries to a pre-rounded scale ratio', async () => {
    const {file}=await fixture(8,4); const inspect=createImageInspector(); const v=metadata(await inspect({action:'overview',path:file}));
    const zoom=metadata(await inspect({action:'crop',path:file,viewId:v.viewId,rectangle:{x:0,y:0,width:8,height:4},zoom:12.25}));
    expect(zoom.displayed).toEqual({width:98,height:49});
    const crop=metadata(await inspect({action:'crop',path:file,viewId:zoom.viewId,rectangle:{x:49,y:24.5,width:12.25,height:12.25}}));
    expect(crop.sourceRect).toEqual({x:4,y:2,width:1,height:1});
  });

  it('fails closed when a canonical ancestor changes during validation', async () => {
    const {root}=await fixture(1,1); const allowed=path.join(root,'allowed'), inside=path.join(allowed,'inside'), saved=path.join(allowed,'saved'), outside=path.join(root,'outside');
    await mkdir(inside,{recursive:true}); await mkdir(outside);
    const file=path.join(inside,'pixels.png');
    await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toFile(file);
    await sharp({create:{width:3,height:3,channels:3,background:'blue'}}).png().toFile(path.join(outside,'pixels.png'));
    const realpath=fs.realpath.bind(fs); let swapped=false, reads=0;
    vi.spyOn(fs,'realpath').mockImplementation(async(...args:any[])=>{
      if(args[0]===file&&++reads===2&&swapped){await fs.unlink(inside);await fs.rename(saved,inside);swapped=false;}
      return (realpath as any)(...args);
    });
    vi.spyOn(configManager,'getConfig').mockImplementation(async()=>{
      if(!swapped){await fs.rename(inside,saved);await fs.symlink(outside,inside);swapped=true;}
      return {allowedDirectories:[allowed]};
    });
    await expect(createImageInspector()({action:'overview',path:file})).rejects.toThrow(/ANCESTOR_CHANGED/);
  });

  it('fails closed when a validated parent is replaced before opening', async () => {
    const {root}=await fixture(); const allowed=path.join(root,'allowed'), inside=path.join(allowed,'inside'), saved=path.join(allowed,'saved'), outside=path.join(root,'outside');
    await mkdir(inside,{recursive:true}); await mkdir(outside);
    const file=path.join(inside,'pixels.png');
    await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toFile(file);
    await sharp({create:{width:3,height:3,channels:3,background:'blue'}}).png().toFile(path.join(outside,'pixels.png'));
    let swapped=false;
    vi.spyOn(configManager,'getConfig').mockImplementation(async()=>{
      if(!swapped){await rename(inside,saved);await symlink(outside,inside);swapped=true;}
      return {allowedDirectories:[allowed]};
    });
    await expect(createImageInspector()({action:'overview',path:file})).rejects.toThrow(/ANCESTOR_CHANGED/);
  });

  it('accepts an explicit smaller overview bound without losing original crop coordinates', async () => {
    const {file}=await fixture(1000,800);const inspect=createImageInspector();
    const view=metadata(await inspect({action:'overview',path:file,maxEdge:250}));
    expect(view.displayed).toEqual({width:250,height:200});
    const crop=metadata(await inspect({action:'crop',path:file,viewId:view.viewId,rectangle:{x:10,y:10,width:20,height:20}}));
    expect(crop.sourceRect).toEqual({x:40,y:40,width:80,height:80});
  });

});
