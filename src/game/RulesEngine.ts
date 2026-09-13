import { BallType, FoulType, GamePhase, type ShotResult, type FrameState, ballValue, isColour } from '../types';
import { MIN_FOUL_PENALTY } from '../constants';
import type { BallBody } from '../physics/BallBody';
import { BallOnCalculator } from './BallOnCalculator';
import { FreeBallRule } from './FreeBallRule';
import { MissRule } from './MissRule';
import { SnookerDetector } from './SnookerDetector';
import { TouchingBall, type TouchingShot } from './TouchingBall';
import { SpottingLogic } from './SpottingLogic';

export interface ShotTracker {
  firstBallHit: BallBody | null;
  firstContactTime?: number;
  firstContactIds?: Set<string>;
  allBallsContacted: Set<string>;
  pottedBalls: BallBody[];
  cueBallPotted: boolean;
  ballsOffTable: BallBody[];
  wasSnookered: boolean;
  jumpShot?: boolean;
  touching?: TouchingShot;
}

export class RulesEngine {
  private ballOnCalc = new BallOnCalculator();
  private freeBallRule = new FreeBallRule();
  private missRule = new MissRule();
  private snookerDetector = new SnookerDetector();
  private touchingBall = new TouchingBall();
  private spottingLogic = new SpottingLogic();

  evaluateShot(tracker: ShotTracker, frame: FrameState, allBalls: BallBody[], cueBall: BallBody): ShotResult {
    const result: ShotResult = {
      ballsPotted: tracker.pottedBalls.map(b => b.type), firstBallHit: tracker.firstBallHit?.type ?? null,
      foul: null, foulBallValue: 0, penaltyPoints: 0, scorePoints: 0, switchTurn: true,
      isMiss: false, needsRespot: [], cueBallInHand: tracker.cueBallPotted ||
        tracker.ballsOffTable.some(b => b.isCueBall), freeBallAvailable: false, breakPoints: 0,
    };
    const ballOn = this.ballOnCalc.getBallOn(frame);
    const onValue = ballOn.length ? Math.min(...ballOn.map(ballValue)) : 4;
    const nominated = frame.nominatedFreeBall
      ? allBalls.find(b => b.id === frame.nominatedFreeBall) : undefined;
    const effectiveValue = (b: BallBody) => b === nominated ? onValue : ballValue(b.type);
    const firstIds = tracker.firstContactIds ?? new Set(tracker.firstBallHit ? [tracker.firstBallHit.id] : []);
    const firsts = allBalls.filter(b => firstIds.has(b.id));
    const touchingOn = tracker.touching?.deemedContact;
    const firstCorrect = !!touchingOn || (nominated ? firstIds.has(nominated.id)
      : tracker.firstBallHit !== null && ballOn.includes(tracker.firstBallHit.type));
    if (touchingOn) result.firstBallHit = touchingOn.type;
    const foulValues: number[] = [];
    const foul = (type: FoulType, value: number) => {
      result.foul ??= type; foulValues.push(Math.max(4, onValue, value));
    };
    for (const b of tracker.touching?.balls ?? []) {
      if (tracker.touching!.pushedIds.has(b.id)) foul(FoulType.PUSH_STROKE, effectiveValue(b));
    }
    if (tracker.jumpShot) foul(FoulType.JUMP_SHOT, onValue);
    if (tracker.cueBallPotted) foul(FoulType.CUE_POTTED, onValue);
    if (!tracker.firstBallHit && !touchingOn) foul(FoulType.NO_CONTACT, onValue);
    else if (tracker.firstBallHit && !firstCorrect) foul(FoulType.WRONG_BALL_FIRST, effectiveValue(tracker.firstBallHit));
    if (!touchingOn && firsts.length > 1 && !firsts.every(b => b === nominated || ballOn.includes(b.type)))
      foul(FoulType.SIMULTANEOUS, Math.max(...firsts.map(effectiveValue)));
    for (const b of tracker.ballsOffTable) foul(b.isCueBall ? FoulType.CUE_OFF_TABLE : FoulType.BALL_OFF_TABLE, effectiveValue(b));
    for (const b of tracker.pottedBalls) {
      if (b.isCueBall) continue;
      if (b !== nominated && !ballOn.includes(b.type)) foul(FoulType.WRONG_POT, effectiveValue(b));
    }
    const objects = tracker.pottedBalls.filter(b => !b.isCueBall);
    if (!result.foul) {
      const count = objects.filter(b => b === nominated || ballOn.includes(b.type)).length;
      result.scorePoints = ballOn.includes(BallType.RED) ? count : (count > 0 ? onValue : 0);
      result.switchTurn = result.scorePoints === 0;
      result.breakPoints = result.scorePoints;
      if (nominated && result.scorePoints === 0 && this.snookeredByFreeBall(cueBall, nominated, ballOn, allBalls)) {
        foul(FoulType.FREE_BALL_SNOOKER, onValue);
      }
    }
    // Potted/forced-off colours return after a foul, including during the colours sequence.
    const removed = [...objects, ...tracker.ballsOffTable];
    for (const b of removed) {
      if (isColour(b.type) && (result.foul || frame.phase === GamePhase.REDS || b === nominated))
        if (!result.needsRespot.includes(b.type)) result.needsRespot.push(b.type);
    }
    if (result.foul) {
      result.scorePoints = 0; result.breakPoints = 0; result.switchTurn = true;
      result.penaltyPoints = Math.max(MIN_FOUL_PENALTY, ...foulValues);
      result.foulBallValue = result.penaltyPoints;
      // Preserve the demo's conservative Miss policy; full referee intent assessment is separate.
      result.isMiss = !tracker.wasSnookered && !firstCorrect && !tracker.jumpShot && !tracker.touching?.pushedIds.size;
    }
    // Award free ball only after GameState has re-spotted colours and computed the incoming ball-on.
    return result;
  }
  private snookeredByFreeBall(cue: BallBody, nominated: BallBody, on: BallType[], balls: BallBody[]): boolean {
    const active = balls.filter(b => b !== cue && b.isOnTable && !b.isPotted);
    if (active.length === 2 && active.some(b => b.type === BallType.BLACK)) return false;
    const targets = active.filter(b => on.includes(b.type));
    const blockers = active.filter(b => !on.includes(b.type));
    if (!targets.length) return false;
    return targets.every(target => {
      const blocking = blockers.filter(b => !this.snookerDetector.bothEdgesClear(cue.getPosition(), target, [b]));
      const nearest = Math.min(...blocking.map(b => Math.hypot(b.posX - cue.posX, b.posZ - cue.posZ)));
      return blocking.includes(nominated) && Math.hypot(nominated.posX - cue.posX, nominated.posZ - cue.posZ) <= nearest + 1e-7;
    });
  }
  getBallOnCalculator(): BallOnCalculator { return this.ballOnCalc; }
  getFreeBallRule(): FreeBallRule { return this.freeBallRule; }
  getMissRule(): MissRule { return this.missRule; }
  getSnookerDetector(): SnookerDetector { return this.snookerDetector; }
  getTouchingBall(): TouchingBall { return this.touchingBall; }
  getSpottingLogic(): SpottingLogic { return this.spottingLogic; }
}
