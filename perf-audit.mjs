import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: false,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
page.on('console', (message) => {
  const text = message.text();
  if (text.includes('[love-all]') || message.type() === 'error') console.log(text);
});
await page.goto('http://localhost:4173/?speed=1');
await page.waitForTimeout(5000);

async function measure(label) {
  const data = await page.evaluate(async () => {
    const w = window.__loveall;
    if (!w) return { error: 'no __loveall' };
    let meshes = 0;
    let lines = 0;
    let sprites = 0;
    let cast = 0;
    let transparent = 0;
    let lights = 0;
    let groups = 0;
    let instanced = 0;
    w.px.scene.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        if (o.castShadow) cast++;
        if (o.material && o.material.transparent) transparent++;
        if (o.isInstancedMesh) instanced++;
      }
      if (o.isLine || o.isLineSegments) lines++;
      if (o.isSprite) sprites++;
      if (o.isLight) lights++;
      if (o.isGroup) groups++;
    });
    const samples = await new Promise((resolve) => {
      const times = [];
      let last = performance.now();
      const start = last;
      function f(t) {
        times.push(t - last);
        last = t;
        if (t - start < 4000) requestAnimationFrame(f);
        else resolve(times);
      }
      requestAnimationFrame(f);
    });
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sorted = [...samples].sort((a, b) => a - b);
    return {
      meshes,
      lines,
      sprites,
      castShadowMeshes: cast,
      transparentMeshes: transparent,
      lights,
      groups,
      instanced,
      fps: +(1000 / avg).toFixed(1),
      avgFrameMs: +avg.toFixed(2),
      p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
      worstFrameMs: +sorted[sorted.length - 1].toFixed(2),
      frameCount: samples.length,
      lastFrameStats: { ...w.px.lastFrameStats },
      pixelTarget: [w.px.pixelWidth, w.px.pixelHeight],
      gpu: (() => {
        const gl = w.px.renderer.getContext();
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unknown';
      })(),
    };
  });
  console.log(label, JSON.stringify(data, null, 2));
  return data;
}

await measure('BASELINE');
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
await page.waitForTimeout(800);
await measure('CPUx6');
await page.screenshot({ path: 'shots/perf-after.png' });
await browser.close();
