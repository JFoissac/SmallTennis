import * as THREE from 'three';

const ELEVATION = THREE.MathUtils.degToRad(25.5);
const DISTANCE = 110;

export class DioramaCamera {
  readonly camera: THREE.OrthographicCamera;
  readonly target = new THREE.Vector3(0, 0, 0);
  private azimuth = Math.PI * 0.25;
  private elevation = ELEVATION;
  private viewZoom = 1.08;
  private fromAzimuth = Math.PI * 0.25;
  private toAzimuth = Math.PI * 0.25;
  private turnT = 1;
  private turnDuration = 0.8;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-32, 32, 20, -20, 0.1, 400);
    this.camera.up.set(0, 1, 0);
    this.updateView(1.6);
    this.place();
  }

  get azQuarter(): number {
    const quarter = Math.round((this.azimuth - Math.PI * 0.25) / (Math.PI * 0.5));
    return ((quarter % 4) + 4) % 4;
  }

  rotateQuarter(direction: 1 | -1): void {
    const base = this.turnT < 1 ? this.toAzimuth : this.azimuth;
    this.fromAzimuth = this.azimuth;
    this.toAzimuth = base + direction * Math.PI * 0.5;
    this.turnT = 0;
  }

  get zoom(): number {
    return this.viewZoom;
  }

  setViewZoom(value: number): void {
    this.viewZoom = Math.max(1, Math.min(2.2, value));
    this.camera.zoom = this.viewZoom;
    this.camera.updateProjectionMatrix();
  }

  zoomBy(delta: number): void {
    this.setViewZoom(this.viewZoom + delta);
  }

  setElevation(degrees: number): void {
    this.elevation = THREE.MathUtils.degToRad(degrees);
    this.place();
  }

  setQuarter(index: number): void {
    this.azimuth = Math.PI * 0.25 + Math.round(index) * Math.PI * 0.5;
    this.fromAzimuth = this.azimuth;
    this.toAzimuth = this.azimuth;
    this.turnT = 1;
    this.place();
  }

  update(dt: number, aspect: number): void {
    if (this.turnT < 1) {
      this.turnT = Math.min(1, this.turnT + dt / this.turnDuration);
      const e = this.turnT * this.turnT * (3 - 2 * this.turnT);
      this.azimuth = this.fromAzimuth + (this.toAzimuth - this.fromAzimuth) * e;
    }
    this.updateView(aspect);
    this.place();
  }

  updateView(aspect: number): void {
    const portrait = aspect < 0.8;
    const minWidth = portrait ? 64 : 80;
    const minHeight = portrait ? 44 : 51;
    const viewHeight = Math.max(minHeight, minWidth / Math.max(0.35, aspect));
    const viewWidth = viewHeight * aspect;
    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.zoom = this.viewZoom;
    this.camera.updateProjectionMatrix();
  }

  private place(): void {
    const horizontal = DISTANCE * Math.cos(this.elevation);
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * horizontal,
      this.target.y + DISTANCE * Math.sin(this.elevation),
      this.target.z + Math.cos(this.azimuth) * horizontal,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  screenPosition(world: THREE.Vector3, width: number, height: number): { x: number; y: number; visible: boolean } {
    const v = world.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * width,
      y: (-v.y * 0.5 + 0.5) * height,
      visible: v.z > -1 && v.z < 1,
    };
  }
}
