import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root = new URL('../apps/web/src/features/illustrations/assets/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
assert.equal(manifest.schemaVersion, 'synthetic-artwork-v1');
assert.equal(manifest.assets.length, 8);
const expected = new Set(['manifest.json']);
let totalBytes = 0;
for (const asset of manifest.assets) {
  assert.match(asset.id, /^(technology|media|language|international|policy|volunteer|music|career)$/);
  assert.equal(asset.dataMode, 'SYNTHETIC');
  assert.equal(asset.origin, 'OPENAI_BUILTIN_IMAGEGEN');
  assert.equal(asset.independentHumanAcceptance, 'NOT_RUN');
  assert.ok(asset.alt && asset.permission && asset.promptVersion && asset.promptScene && asset.generatedDate);
  assert.match(asset.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(asset.variants.length, 2);
  assert.deepEqual(asset.variants.map(v => [v.width, v.height]), [[480, 270], [960, 540]]);
  for (const variant of asset.variants) {
    assert.equal(variant.fileName, `${asset.id}-${variant.width}.webp`);
    assert.ok(!expected.has(variant.fileName), 'Duplicate artwork identity');
    expected.add(variant.fileName);
    const bytes = await readFile(new URL(variant.fileName, root));
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    assert.equal(bytes.length, variant.bytes);
    assert.ok(bytes.length <= manifest.maxSingleBytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), variant.sha256);
    totalBytes += bytes.length;
  }
}
assert.deepEqual(new Set(await readdir(root)), expected, 'Undeclared artwork file');
assert.equal(totalBytes, manifest.totalBytes);
assert.ok(totalBytes <= manifest.maxTotalBytes);
console.log(JSON.stringify({status: 'PASS', assets: manifest.assets.length, variants: expected.size - 1, totalBytes, independentHumanAcceptance: 'NOT_RUN'}));
