import './style.css';
import * as THREE from 'three';
import { PixelRenderer } from './core/renderer';
import { DioramaCamera } from './core/camera';
import { ClubWorld } from './world/world';
import { MatchGame } from './game/match';
import { seedFrom } from './game/rng';
import { UI } from './ui/ui';

const stage = document.getElementById('stage') as HTMLElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

const px = new PixelRenderer(stage);
const rig = new DioramaCamera();
const world = new ClubWorld(px.scene, px);

const params = new URLSearchParams(window.location.search);
if (params.has('q')) rig.setQuarter(Number(params.get('q')));
if (params.has('elev')) rig.setElevation(Number(params.get('elev')));
const explicitZoom = params.has('zoom');
const zoom = Number(params.get('zoom') ?? '1.12');
if (zoom > 0) rig.setViewZoom(zoom);

const game = new MatchGame(px.scene, world, rig, seedFrom(params.get('seed'), Math.floor(Math.random() * 0xffffffff)));
if (params.get('time') === 'dusk') game.setTime('dusk');
if (params.get('time') === 'night') game.setTime('night');
if (params.get('surface') === 'grass') game.setSurface('grass');
if (params.get('surface') === 'hard') game.setSurface('hard');
if (params.get('rain') === '1') game.setRain(true);
if (params.get('wet') === '1') world.setWetness(1);
if (params.get('speed') === '3') game.setSpeed(3);
const simMode = params.get('sim') === '1';

const ui = new UI(uiRoot, stage, game, world, rig);

function resize(): void {
  px.resize(stage.clientWidth, stage.clientHeight);
  rig.updateView(stage.clientWidth / Math.max(1, stage.clientHeight));
  if (!explicitZoom) rig.setViewZoom(stage.clientWidth < 820 ? (stage.clientHeight > stage.clientWidth ? 1.4 : 1.16) : 1.12);
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let realElapsed = 0;
let simTime = 0;
function tick(dt: number): void {
  realElapsed += dt;
  const simDt = dt * game.speed;
  simTime += simDt;
  rig.update(dt, stage.clientWidth / Math.max(1, stage.clientHeight));
  game.update(simDt, simTime);
  world.update(simDt, simTime, rig, game.ballPos, 0);
  if (!simMode) {
    px.render(px.scene, rig.camera, realElapsed);
    ui.update(dt, realElapsed);
  }
}
function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  tick(dt);
  requestAnimationFrame(frame);
}
if (!simMode) requestAnimationFrame(frame);

declare global {
  interface Window {
    __loveall?: {
      world: ClubWorld;
      rig: DioramaCamera;
      px: PixelRenderer;
      game: MatchGame;
      ui: UI;
      sim: boolean;
      step: (dt?: number) => void;
    };
  }
}
window.__loveall = { world, rig, px, game, ui, sim: simMode, step: (dt = 1 / 60) => tick(dt) };

