import { describe, expect, it } from 'vitest';
import { DioramaCamera } from '../src/core/camera';

describe('diorama camera turning', () => {
  it('accumulates quarter turns when clicked again before a turn finishes', () => {
    const rig = new DioramaCamera();
    rig.setQuarter(0);
    rig.rotateQuarter(1);
    rig.update(0.2, 1.6);
    rig.rotateQuarter(1);
    rig.update(1, 1.6);
    expect(rig.azQuarter).toBe(2);
  });

  it('reports left turns as quarters 3 rather than -1', () => {
    const rig = new DioramaCamera();
    rig.setQuarter(0);
    rig.rotateQuarter(-1);
    rig.update(1, 1.6);
    expect(rig.azQuarter).toBe(3);
  });
});
