import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4173/?speed=1');
await page.waitForTimeout(5000);
const data = await page.evaluate(() => {
  const w = window.__loveall;
  const root = w.world.root;
  function stats(obj) {
    let meshes = 0;
    let cast = 0;
    let tris = 0;
    obj.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        if (o.castShadow) cast++;
        const g = o.geometry;
        if (g && g.index) tris += g.index.count / 3;
        else if (g && g.attributes?.position) tris += g.attributes.position.count / 3;
      }
    });
    return { meshes, cast, tris: Math.round(tris) };
  }
  const children = root.children.map((c, i) => ({
    i,
    type: c.type,
    pos: c.position?.toArray(),
    stats: stats(c),
  }));
  const materials = new Map();
  const geometries = new Map();
  w.px.scene.traverse((o) => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (!m) continue;
      const key = `${m.type}:${m.color?.getHexString?.() ?? '?'}:${m.map ? 'map' : ''}:${m.transparent ? 't' : 'o'}`;
      const row = materials.get(key) || { key, meshCount: 0, cast: 0 };
      row.meshCount++;
      if (o.castShadow) row.cast++;
      materials.set(key, row);
    }
    const g = o.geometry;
    const key = g?.type ?? '?';
    const row = geometries.get(key) || { key, meshCount: 0, cast: 0 };
    row.meshCount++;
    if (o.castShadow) row.cast++;
    geometries.set(key, row);
  });
  return {
    children: children.sort((a, b) => b.stats.meshes - a.stats.meshes),
    topMaterials: [...materials.values()].sort((a, b) => b.meshCount - a.meshCount).slice(0, 20),
    topGeometries: [...geometries.values()].sort((a, b) => b.meshCount - a.meshCount).slice(0, 20),
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
