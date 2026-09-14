import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import assert from 'node:assert/strict';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const name = `Snooker-v${pkg.version}`;
const output = 'release';
await mkdir(output, { recursive: true });
const result = await build({
  entryPoints: ['src/main.ts'], bundle: true, write: false, minify: true,
  platform: 'browser', format: 'iife', target: 'es2022', sourcemap: false,
  legalComments: 'inline', metafile: true,
});
assert.equal(result.outputFiles.length, 1, 'Offline release must be one JS bundle');
assert.ok(Object.values(result.metafile.outputs).every(o => o.imports.length === 0), 'External imports are forbidden');
const thirdPartyInputs = Object.keys(result.metafile.inputs).filter(p => p.includes('node_modules/'));
assert.ok(thirdPartyInputs.every(p => p.startsWith('node_modules/three/')), 'Review notices for newly bundled dependencies');

const license = await readFile('LICENSE', 'utf8');
const threeLicense = await readFile('node_modules/three/LICENSE', 'utf8');
const cannonLicense = await readFile('node_modules/cannon-es/LICENSE', 'utf8');
const threeVersion = JSON.parse(await readFile('node_modules/three/package.json', 'utf8')).version;
const cannonVersion = JSON.parse(await readFile('node_modules/cannon-es/package.json', 'utf8')).version;
const notices = `Third-party notices for Snooker v${pkg.version}\n\n` +
  `Bundled in the standalone HTML: three.js (${threeVersion}), MIT License.\n\n${threeLicense}\n\n` +
  `Source project dependency only (not bundled): cannon-es (${cannonVersion}).\n\n${cannonLicense}\n`;
await writeFile('THIRD_PARTY_NOTICES.txt', notices.trimEnd() + '\n');
const escapeHtml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const about = `<details class="club-notices">
<summary>版权与许可</summary>
<pre>${escapeHtml(license + '\n\n' + notices)}</pre></details>`;
let html = await readFile('index.html', 'utf8');
const entry = '<script type="module" src="/src/main.ts"></script>';
assert.equal(html.split(entry).length, 2, 'Expected exactly one development entry');
html = html.replace('<title>斯诺克 Snooker</title>', `<title>Snooker v${pkg.version} · 离线版</title>`)
  .replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'">`)
  .replace('<div id="release-notices"></div>', () => `<div id="release-notices">${about}</div>`)
  .replace(entry, () => `<script>${result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`);
assert.ok(!/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=|sourceMappingURL=/i.test(html), 'Release must not reference external scripts, styles, or source maps');
const instructions = `Snooker v${pkg.version} — 离线分享版\n\n` +
  `解压后双击 ${name}.html，使用已安装的 Chrome / Edge 等支持 WebGL 2 的桌面浏览器打开。\n` +
  `不需要安装依赖、启动服务器或联网。也可以只发送 HTML 文件，版权与第三方声明已嵌入。\n` +
  `若聊天软件直接预览无法游玩，请先保存文件再用浏览器打开。\n\n` +
  `操作：\n开始游戏后点击 D 区空位放白球。\n鼠标拖动瞄准，滚轮 / 上下键调力度，空格出杆。\n` +
  `F 切换精瞄，Shift 临时精瞄，左右键微调。左右竖条可直接拖动。\n` +
  `右下球面选择击球点，每杆结束自动回正。右侧倾角默认自动避让，手动调节后可恢复自动。\n` +
  `打入红球后选择彩球，出杆前可更换。支持同机双人轮流对战。\n\n` +
  `暂停与结算：\n右上角暂停按钮或 Esc 暂停；可继续或退出返回首页。\n` +
  `Points Remained 表示台面理论最高分，不预估未来犯规罚分。\n` +
  `每局结束显示比分和击球记录；白球数字代表罚分，白球中的 ↻ 代表交换击球权。\n` +
  `点击高阶数据查看六项统计（包括单杆最高分），切换当前 Frame / 整个 Match。\n` +
  `超分且停球后，暂停面板允许落后方认输本局，保留比分与统计；延分不开放，人机模式仅玩家可认输。\n` +
  `点击下一局后重新摆球；比赛结束后可再来一场。\n\n` +
  `高阶数据：\n出杆前选择进攻 / 防守，仅进攻杆计入进球、长台、库边及架杆成功率。\n` +
  `进攻目标自动识别，也可手动指定目标球与球袋；长台按母球至目标球加目标球至袋口的总距离超过桌长 2/3 判断。\n` +
  `母球或目标球表面距胶边不超过 1/4 球直径计库边球，十字架杆和高架杆均计架杆。\n` +
  `合法防守交权后，对方第一杆未合法进球计防守成功；防守犯规计失败，未获回应不计样本。\n\n` +
  `规则与操作：\n末黑进球或犯规后平分时重置黑球，抽签胜者选择谁先打，先打者从 D 区放置白球。\n` +
  `争黑中的首次进球或犯规决定本局胜负，安全球继续交换击球。\n` +
  `犯规后可自己接手或要求对方从现有球位继续。判为 Miss 且出杆前、罚分后都未超分时，才可复位重打并保留罚分。\n` +
  `延分指清台刚好追平，仍可复位；本杆罚分导致超分则不能复位。\n` +
  `自由球可指定代替球或放弃，代替球按目标球计分并复位；超分后仍可获得自由球。\n` +
  `彩球占点时使用最高分空点，全部占点则按规则自动安排最近不贴球的位置。\n` +
  `Miss 仍为简化自动判断；解斯诺克失败不自动判 Miss，未启用裁判尽力判断及三次 Miss 判负。\n\n` +
  `下一版本预告：v1.4.0 将优化人机对战逻辑，具体内容与时间以后续发布说明为准。\n\n` +
  `关闭或刷新页面不保存进度。物理与部分规则仍是 demo 近似。\n\n` +
  `Copyright (c) 2026 SevChu. All rights reserved.\n详见 LICENSE 与 THIRD_PARTY_NOTICES.txt。\n`;
const entries = [
  [`${name}.html`, html], ['游玩说明.txt', instructions], ['LICENSE', license],
  ['THIRD_PARTY_NOTICES.txt', notices], ['RELEASE_NOTES.md', await readFile('RELEASE_NOTES.md', 'utf8')],
];
for (const [file, contents] of entries) await writeFile(`${output}/${file}`, contents);

// Small, portable ZIP writer: UTF-8 filenames, DEFLATE, no installation or external archiver.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const chunks = [], directory = [];
  let offset = 0;
  for (const [filename, content] of files) {
    const file = Buffer.from(filename), data = Buffer.from(content), compressed = deflateRawSync(data);
    const local = Buffer.alloc(30), central = Buffer.alloc(46), crc = crc32(data);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(0x5d2c, 12); // 2026-09-12, reproducible timestamp.
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(file.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    local.copy(central, 8, 6, 28); central.writeUInt32LE(offset, 42);
    chunks.push(local, file, compressed); directory.push(central, file);
    offset += local.length + file.length + compressed.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, central, end]);
}
await writeFile(`${output}/${name}.zip`, zip(entries));
const checksums = [];
for (const file of [`${name}.html`, `${name}.zip`]) {
  const data = await readFile(`${output}/${file}`);
  checksums.push(`${createHash('sha256').update(data).digest('hex')}  ${file}`);
  console.log(`${output}/${file}: ${data.length} bytes`);
}
await writeFile(`${output}/SHA256SUMS.txt`, checksums.join('\n') + '\n');
