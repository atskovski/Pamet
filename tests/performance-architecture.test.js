'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('production architecture keeps signed-out startup split and measurable', () => {
  const main = fs.readFileSync('js/main.js', 'utf8');
  const features = fs.readFileSync('js/authenticated-features.js', 'utf8');
  const build = fs.readFileSync('scripts/build-production.js', 'utf8');
  const secure = fs.readFileSync('secure-server.js', 'utf8');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.match(main, /loadAuthenticatedFeatures/);
  assert.doesNotMatch(main, /import "\.\/care-planning\.js"/);
  assert.match(features, /import "\.\/care-planning\.js"/);
  assert.match(build, /asset-manifest\.json/);
  assert.match(secure, /max-age=31536000, immutable/);
  assert.match(secure, /\/api\/performance/);
  assert.match(pkg.scripts.start, /performance-bootstrap/);
});

test('production build emits hashed assets with a smaller signed-out path', () => {
  const manifest = JSON.parse(fs.readFileSync('dist/asset-manifest.json', 'utf8'));
  for (const key of ['bootstrapJs', 'featuresJs', 'bootstrapCss', 'featuresCss']) {
    assert.match(manifest[key], /^\/dist\/pamet\.(?:bootstrap|features|styles)\.[a-f0-9]{12}\.(?:js|css)$/);
    assert.ok(fs.existsSync(manifest[key].slice(1)), `${key} should exist`);
  }
  const bootstrap = fs.statSync('dist/pamet.min.js').size + fs.statSync('dist/pamet.min.css').size;
  const deferred = fs.statSync('dist/pamet.features.min.js').size + fs.statSync('dist/pamet.features.min.css').size;
  assert.ok(bootstrap < 260 * 1024, `signed-out bootstrap is ${bootstrap} bytes`);
  assert.ok(deferred > 0, 'authenticated feature bundle should contain deferred work');
});

test('hot-path database and telemetry amplification are bounded', () => {
  const mysqlPerf = fs.readFileSync('lib/mysql-performance.js', 'utf8');
  const telemetry = fs.readFileSync('lib/telemetry-transport.js', 'utf8');
  assert.match(mysqlPerf, /last_used_at < NOW\(\) - INTERVAL 5 MINUTE/);
  assert.match(mysqlPerf, /seen = new Map/);
  assert.match(telemetry, /maxBatch = 32/);
  assert.match(telemetry, /resourceMetrics/);
  assert.match(telemetry, /resourceLogs/);
});

test('derived journal analytics are memoized without changing the store contract', () => {
  const perf = fs.readFileSync('js/store-performance.js', 'utf8');
  for (const method of ['patterns', 'metrics', 'report', 'totalDaysLogged']) assert.ok(perf.includes(`memoize('${method}')`));
  assert.match(perf, /invalidateAfter\('persistEntries'\)/);
});
