import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
test('local server serves the app, denies unknown files and rejects writes', async () => {
  const port = 22000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Server exited before listening.'); }), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Server startup timeout')), 5000); timer.unref(); })]);
    const base = `http://127.0.0.1:${port}`;
    for (const path of ['/', '/app.mjs', '/core.mjs', '/styles.css', '/icon.svg']) {
      const response = await fetch(base + path); assert.equal(response.status, 200); assert.ok((await response.text()).length > 100); assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.ok(response.headers.get('content-security-policy').includes("connect-src 'none'"));
    }
    assert.equal((await fetch(base + '/challenge.json')).status, 404);
    assert.equal((await fetch(base + '/%2e%2e/package.json')).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    const head = await fetch(base, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  } finally { child.kill('SIGTERM'); await once(child, 'exit'); }
});
