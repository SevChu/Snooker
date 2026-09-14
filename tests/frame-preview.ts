// Manual visual fixture. This entry is never included in either release build.
import { UIManager } from '../src/ui/UIManager';
import { FrameRecord } from '../src/game/FrameRecord';
import { GameStateManager } from '../src/game/GameState';
import { BallType, FoulType, GameMode, AIDifficulty, GamePhase, ballValue, type ShotResult } from '../src/types';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { BallBody } from '../src/physics/BallBody';
import { remainingPoints } from '../src/game/RemainingPoints';
import { mergeStatistics, ShotStatistics } from '../src/game/ShotStatistics';

const ui = new UIManager();
const record = new FrameRecord();
const frame = new GameStateManager().createNewFrame();
const attack = { intent: 'attack' as const, long: true, cushion: true, rest: true };
const safety = { ...attack, intent: 'safety' as const };
const result = (patch: Partial<ShotResult>): ShotResult => ({ ballsPotted: [], firstBallHit: BallType.RED,
  foul: null, foulBallValue: 0, penaltyPoints: 0, scorePoints: 0, switchTurn: false, isMiss: false,
  needsRespot: [], cueBallInHand: false, freeBallAvailable: false, breakPoints: 0, ...patch });
for (const ball of [BallType.RED, BallType.BLACK, BallType.RED, BallType.BLACK]) {
  record.recordShot(frame, result({ ballsPotted: [ball], scorePoints: ballValue(ball) }), attack);
}
record.recordShot(frame, result({ switchTurn: true }), safety);
frame.striker = 1;
record.recordShot(frame, result({ foul: FoulType.CUE_POTTED, penaltyPoints: 4, switchTurn: true }), safety);
frame.striker = 0;
for (const ball of [BallType.YELLOW, BallType.GREEN, BallType.BROWN, BallType.BLUE, BallType.PINK, BallType.BLACK]) {
  record.recordShot(frame, result({ ballsPotted: [ball], scorePoints: ballValue(ball) }));
}
const earlier = new ShotStatistics();
for (let i = 0; i < 8; i++) earlier.record(0, result({ switchTurn: true }), attack);
earlier.players[0].highestBreak = 64;
earlier.record(1, result({ ballsPotted: [BallType.RED], scorePoints: 1 }), attack);
earlier.players[1].highestBreak = 1;
const matchComplete = new URLSearchParams(location.search).has('final');
const summary = { frameNumber: 2, winner: 0, scores: [47, 0] as [number, number], highestBreaks: record.highestBreaks,
  framesWon: (matchComplete ? [2, 0] : [1, 1]) as [number, number], playerNames: ['Player 1', 'Player 2'] as [string, string],
  visits: record.snapshot(), matchComplete,
  frameStatistics: mergeStatistics(record.statistics.players),
  matchStatistics: mergeStatistics(earlier.players, record.statistics.players) };
ui.setCallbacks({ onStartGame: () => {}, onPlayAgain: () => ui.showFrameSummary(summary),
  onBackToMenu: () => ui.showMenu(), onPause: () => {}, onResume: () => {},
  onNextFrame: () => ui.showFrameSummary({ ...summary, frameNumber: 3 }) });
if (new URLSearchParams(location.search).has('concede')) {
  const game = new GameStateManager(), world = new PhysicsWorld();
  game.startMatch({ mode: GameMode.PASS_PLAY, difficulty: AIDifficulty.MEDIUM,
    totalFrames: matchComplete ? 1 : 3, player1Name: 'Player 1', player2Name: 'Player 2' });
  [BallType.YELLOW, BallType.GREEN, BallType.BROWN, BallType.BLUE, BallType.PINK, BallType.BLACK]
    .forEach((type, i) => new BallBody(type, type, { x: 1 + i * .2, z: .8 }, world));
  game.initBallStates(world.getBalls()); game.match!.frame.phase = GamePhase.COLOURS;
  game.match!.frame.scores = [30, 0];
  const pause = () => {
    const player = game.getConcedingPlayer();
    ui.showPause(player === null ? undefined : { player, name: game.match!.playerNames[player],
      deficit: 30, remaining: remainingPoints(game.match!.frame) });
  };
  ui.setCallbacks({ onStartGame: () => {}, onPlayAgain: () => ui.showMenu(), onBackToMenu: () => ui.showMenu(),
    onPause: pause, onResume: () => ui.hidePause(), onConcedeFrame: player => {
      if (game.concedeFrame(player)) ui.showFrameSummary(game.frameSummary!);
    }, onNextFrame: () => {
      if (game.continueFrame()) { game.initBallStates(world.getBalls()); ui.showGame(game.match!); pause(); }
    } });
  ui.showGame(game.match!); pause();
} else ui.showFrameSummary(summary);
