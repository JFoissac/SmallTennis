import * as THREE from 'three';
import type { DioramaCamera } from '../core/camera';
import type { PixelRenderer } from '../core/renderer';
import { C } from '../core/palette';
import { Court, COURT, type SurfaceType } from './court';
import { Island } from './island';
import { Clubhouse, Floodlights, GroundsShed, Stand, CourtFurniture, Flag } from './structures';
import { SkySystem, type TimeMode } from './sky';
import { Weather } from './weather';
import { CloudField } from './models';
import { batchColoredStatic, batchStatic } from './batch';

export class ClubWorld {
  readonly root = new THREE.Group();
  readonly island: Island;
  readonly court: Court;
  readonly clubhouse: Clubhouse;
  readonly stand: Stand;
  readonly shed: GroundsShed;
  readonly furniture: CourtFurniture;
  readonly floodlights: Floodlights;
  readonly sky: SkySystem;
  readonly weather: Weather;
  readonly clouds: CloudField;
  readonly flag: Flag;
  timeMode: TimeMode = 'day';
  surface: SurfaceType = 'clay';
  private px: PixelRenderer;

  constructor(scene: THREE.Scene, px: PixelRenderer) {
    this.px = px;
    scene.add(this.root);
    this.island = new Island(this.root);
    this.court = new Court(this.root);
    this.clubhouse = new Clubhouse(this.root);
    this.flag = new Flag(this.root, -15.4, 0, 11.6, 1.15);
    this.stand = new Stand(this.root);
    this.shed = new GroundsShed(this.root);
    this.furniture = new CourtFurniture(this.root);
    this.floodlights = new Floodlights(this.root);
    this.sky = new SkySystem(scene, px);
    this.weather = new Weather(this.root, this.court, px);
    this.clouds = new CloudField(this.root);
    this.setTime('day');
    this.setSurface('clay');
    batchStatic(this.island.root, 'island');
    this.court.optimizeStatic();
    this.clubhouse.optimizeStatic();
    batchStatic(this.stand.root, 'stand');
    batchStatic(this.shed.root, 'shed');
    batchStatic(this.furniture.root, 'furniture');
    batchStatic(this.floodlights.root, 'floodlights');
    batchColoredStatic(
      [
        this.island.root,
        this.court.group,
        this.clubhouse.root,
        this.stand.root,
        this.shed.root,
        this.furniture.root,
        this.floodlights.root,
      ],
      this.root,
      'world',
    );
  }

  setTime(mode: TimeMode): void {
    this.timeMode = mode;
    this.sky.setMode(mode);
  }

  setSurface(surface: SurfaceType): void {
    this.surface = surface;
    this.court.setSurface(surface);
  }

  setRain(on: boolean): void {
    this.weather.setRain(on);
  }

  setWetness(value: number): void {
    this.weather.setWetness(value);
  }

  update(dt: number, time: number, camera: DioramaCamera, ballPos: THREE.Vector3, cheer = 0): void {
    this.sky.update(dt);
    this.clubhouse.setNight(this.sky.nightFactor, this.sky.duskFactor);
    this.clubhouse.update(dt, time);
    this.floodlights.setNight(this.sky.floodFactor);
    this.weather.setSkyTint(this.sky.nightFactor > 0.5 ? C.night : this.sky.duskFactor > 0.5 ? C.peach : C.paleAqua);
    this.court.update(dt);
    this.flag.update(dt);
    this.clouds.update(dt, time);
    this.stand.setBall(ballPos);
    if (cheer > 0) this.stand.cheer(cheer);
    this.stand.update(dt);
    this.weather.update(dt, time, camera.camera);
  }
}
