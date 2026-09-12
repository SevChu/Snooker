import { MAX_CUE_ELEVATION } from '../constants';
import type { BallBody } from '../physics/BallBody';
import { assessCueAccess, type BridgeKind, type CueAccess } from '../physics/CueMechanics';
import type { SpinParams, Vec3 } from '../types';

/** Automatic clearance is the default; a deliberate slider adjustment takes precedence. */
export class CueElevation {
  value = 0;
  automatic = true;

  setManual(value: number): void {
    this.value = Math.max(0, Math.min(MAX_CUE_ELEVATION, value));
    this.automatic = false;
  }

  reset(): void { this.value = 0; this.automatic = true; }

  assess(cue: BallBody, balls: BallBody[], aim: Vec3, spin: SpinParams, bridge: BridgeKind): CueAccess {
    let access = assessCueAccess(cue, balls, aim, { ...spin, elevation: this.value }, bridge);
    if (this.automatic) {
      // The search returns a tested angle, not an untested extra clearance offset.
      const elevation = Math.min(MAX_CUE_ELEVATION, access.minimumElevation);
      if (this.value !== elevation) {
        this.value = elevation;
        access = assessCueAccess(cue, balls, aim, { ...spin, elevation }, bridge);
      }
    }
    return access;
  }
}
