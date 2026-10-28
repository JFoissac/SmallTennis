import { preview } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const matchesPerRun = Math.max(1, Number(option('matches', '10')));
const seed = Number(option('seed', '20261028'));
const reportDir = path.resolve('reports');
fs.mkdirSync(reportDir, { recursive: true });

const server = await preview({ preview: { port: 4313, strictPort: false } });
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ headless: true });

function checkScorelines(matches) {
  const problems = [];
  for (const match of matches) {
    if (match.sets.length < 2 || match.sets.length > 3) problems.push(`${match.index}: ${match.sets.length} sets`);
    const sideA = match.sets.filter((s) => s.a > s.b).length;
    const sideB = match.sets.filter((s) => s.b > s.a).length;
    if (Math.max(sideA, sideB) !== 2) problems.push(`${match.index}: winner sets ${Math.max(sideA, sideB)}`);
    if (Math.min(sideA, sideB) > 1) problems.push(`${match.index}: loser sets ${Math.min(sideA, sideB)}`);
    for (const set of match.sets) {
      if (set.kind === 'matchTiebreak') {
        if (Math.max(set.a, set.b) < 10 || Math.abs(set.a - set.b) < 2) problems.push(`${match.index}: bad match tiebreak ${set.a}-${set.b}`);
      } else if (Math.max(set.a, set.b) !== 4) {
        problems.push(`${match.index}: bad set ${set.a}-${set.b}`);
      }
    }
  }
  return problems;
}

async function runBatch({ label, wet }) {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${base}/?seed=${seed}&sim=1&speed=3&wet=${wet ? 1 : 0}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__loveall?.sim === true, null, { timeout: 30000 });
  const result = await page.evaluate(
    ({ label, wet, matchesPerRun }) => {
      const w = window.__loveall;
      const career = w.game.career;
      const stand = [];
      let steps = 0;
      const guard = matchesPerRun * 140000;
      while (career.matches.length < matchesPerRun && steps < guard) {
        if (wet) w.world.setWetness(1);
        w.step(1 / 30);
        steps++;
        if (steps % 600 === 0) stand.push(w.world.stand.presentCount);
      }
      return {
        label,
        wet,
        steps,
        matches: career.matches.map((m) => ({ ...m })),
        players: career.playerList(),
        ladder: career.ladder.map((entry) => ({
          id: entry.profile.id,
          wins: entry.wins,
          losses: entry.losses,
        })),
        stand,
        capacity: w.world.stand.capacity,
        seed: w.game.seed,
      };
    },
    { label, wet, matchesPerRun },
  );
  await page.close();
  return { ...result, pageErrors };
}

async function captureCrowd() {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  await page.goto(`${base}/?seed=${seed}&speed=3`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => Boolean(window.__loveall), null, { timeout: 30000 });
  await page.waitForTimeout(9000);
  const sample = async () =>
    page.evaluate(() => {
      const w = window.__loveall;
      return {
        present: w.world.stand.presentCount,
        capacity: w.world.stand.capacity,
        target: w.world.stand.attendanceGoal,
        rain: w.world.weather.rainLevel,
        wetness: w.world.weather.wetnessLevel,
        cover: w.world.coverAmount,
        phase: w.game.getView().phase,
      };
    });

  const dry = await sample();
  await page.screenshot({ path: path.join(reportDir, 'crowd-dry.png') });

  await page.evaluate(() => window.__loveall.game.setRain(true));
  await page.waitForTimeout(14000);
  const rain = await sample();
  await page.screenshot({ path: path.join(reportDir, 'crowd-rain.png') });

  await page.evaluate(() => window.__loveall.game.setRain(false));
  await page.waitForTimeout(20000);
  const after = await sample();
  await page.screenshot({ path: path.join(reportDir, 'crowd-after-rain.png') });

  await page.evaluate(() => {
    const w = window.__loveall;
    w.world.setWetness(1);
    w.rig.setViewZoom(1.45);
  });
  await page.waitForTimeout(4000);
  const wetCourt = await sample();
  await page.screenshot({ path: path.join(reportDir, 'court-wet.png') });

  await page.close();
  return { dry, rain, after, wetCourt };
}

function aggregate(batch) {
  const points = batch.matches.reduce((sum, m) => sum + m.points, 0);
  const errors = batch.matches.reduce((sum, m) => sum + m.errors, 0);
  const winners = batch.matches.reduce((sum, m) => sum + m.winners, 0);
  const aces = batch.matches.reduce((sum, m) => sum + m.aces, 0);
  const rallies = batch.matches.reduce((sum, m) => sum + m.avgRally * m.points, 0);
  const shots = batch.matches.reduce((sum, m) => sum + m.shots, 0);
  return {
    matches: batch.matches.length,
    points,
    shots,
    errors,
    winners,
    aces,
    errorRate: shots ? Math.round((errors / shots) * 1000) / 1000 : 0,
    errorsPerPoint: points ? Math.round((errors / points) * 1000) / 1000 : 0,
    avgRally: points ? Math.round((rallies / points) * 10) / 10 : 0,
    avgAttendance: batch.stand.length
      ? Math.round((batch.stand.reduce((a, b) => a + b, 0) / batch.stand.length) * 10) / 10
      : null,
    minAttendance: batch.stand.length ? Math.min(...batch.stand) : null,
    capacity: batch.capacity,
  };
}

console.log(`sim: ${matchesPerRun} matches per run, seed ${seed}`);
const crowd = await captureCrowd();
const dry = await runBatch({ label: 'dry', wet: false });
const wet = await runBatch({ label: 'wet', wet: true });

const dryMetrics = aggregate(dry);
const wetMetrics = aggregate(wet);
const scoreProblems = [...checkScorelines(dry.matches), ...checkScorelines(wet.matches)];
const ladderWins = dry.ladder.reduce((sum, e) => sum + e.wins, 0);
const checks = {
  allMatchesCompleted: dry.matches.length === matchesPerRun && wet.matches.length === matchesPerRun,
  legalScorelines: scoreProblems.length === 0,
  careerProgressed: dry.matches.length === matchesPerRun && ladderWins === matchesPerRun,
  wetMoreErrors: wetMetrics.errorRate > dryMetrics.errorRate,
  wetShorterRallies: wetMetrics.avgRally < dryMetrics.avgRally,
  crowdThinsInRain: crowd.rain.present < crowd.dry.present,
  crowdReturnsWhenDry: crowd.after.present >= crowd.rain.present,
  noPageErrors: dry.pageErrors.length === 0 && wet.pageErrors.length === 0,
};

const report = {
  generatedAt: new Date().toISOString(),
  seed,
  matchesPerRun,
  totalMatches: dryMatchesTotal(),
  checks,
  scoreProblems,
  pages: { dry: dry.pageErrors, wet: wet.pageErrors },
  dry: dryMetrics,
  wet: wetMetrics,
  crowd,
  ladder: dry.ladder,
  players: dry.players,
  lastMatches: { dry: dry.matches.slice(-2), wet: wet.matches.slice(-2) },
};
function dryMatchesTotal() {
  return dry.matches.length + wet.matches.length;
}

fs.writeFileSync(path.join(reportDir, 'sim-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ checks, dry: dryMetrics, wet: wetMetrics, crowd }, null, 2));
await browser.close();
await server.httpServer.close();

const failed = Object.entries(checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`FAILED: ${failed.map(([name]) => name).join(', ')}`);
  process.exitCode = 1;
}
