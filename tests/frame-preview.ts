// Manual visual fixture. This entry is never included in either release build.
import { UIManager } from '../src/ui/UIManager';
import { FrameRecord } from '../src/game/FrameRecord';
import { GameStateManager } from '../src/game/GameState';
import { BallType, FoulType, ballValue, type ShotResult } from '../src/types';

const ui = new UIManager();
const record = new FrameRecord();
const frame = new GameStateManager().createNewFrame();
const result = (patch: Partial<ShotResult>): ShotResult => ({ ballsPotted: [], firstBallHit: BallType.RED,
  foul: null, foulBallValue: 0, penaltyPoints: 0, scorePoints: 0, switchTurn: false, isMiss: false,
  needsRespot: [], cueBallInHand: false, freeBallAvailable: false, breakPoints: 0, ...patch });
for (const ball of [BallType.RED, BallType.BLACK, BallType.RED, BallType.BLACK]) {
  record.recordShot(frame, result({ ballsPotted: [ball], scorePoints: ballValue(ball) }));
}
record.recordShot(frame, result({ switchTurn: true }));
frame.striker = 1;
record.recordShot(frame, result({ foul: FoulType.CUE_POTTED, penaltyPoints: 4, switchTurn: true }));
frame.striker = 0;
for (const ball of [BallType.YELLOW, BallType.GREEN, BallType.BROWN, BallType.BLUE, BallType.PINK, BallType.BLACK]) {
  record.recordShot(frame, result({ ballsPotted: [ball], scorePoints: ballValue(ball) }));
}
ui.showFrameSummary({ frameNumber: 1, winner: 0, scores: [47, 0], highestBreaks: record.highestBreaks,
  framesWon: [1, 0], playerNames: ['Player 1', 'Player 2'], visits: record.snapshot(), matchComplete: false });
