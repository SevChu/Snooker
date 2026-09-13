import { BallType, type FrameState, type ShotResult } from '../types';

export type VisitToken =
  | { kind: 'pot'; ball: BallType; freeBall: boolean }
  | { kind: 'penalty'; points: number; recipient: number }
  | { kind: 'switch'; to: number; reason: string };

export interface FrameVisit {
  player: number;
  points: number;
  tokens: VisitToken[];
  ended: boolean;
}

export interface FrameSummary {
  frameNumber: number;
  winner: number;
  scores: [number, number];
  highestBreaks: [number, number];
  framesWon: [number, number];
  playerNames: [string, string];
  visits: FrameVisit[];
  matchComplete: boolean;
}

/** One row per visit, with penalty awards kept separate from break points. */
export class FrameRecord {
  visits: FrameVisit[] = [];
  highestBreaks: [number, number] = [0, 0];

  private visit(player: number): FrameVisit {
    const last = this.visits.at(-1);
    if (last && last.player === player && !last.ended) return last;
    const visit: FrameVisit = { player, points: 0, tokens: [], ended: false };
    this.visits.push(visit);
    return visit;
  }

  recordShot(frame: FrameState, result: ShotResult): void {
    const visit = this.visit(frame.striker);
    if (!result.foul && result.scorePoints > 0) {
      const freeType = frame.balls.find(b => b.id === frame.nominatedFreeBall)?.type;
      visit.tokens.push(...result.ballsPotted.filter(b => b !== BallType.CUE).map(ball =>
        ({ kind: 'pot' as const, ball, freeBall: ball === freeType })));
      visit.points += result.scorePoints;
      this.highestBreaks[frame.striker] = Math.max(this.highestBreaks[frame.striker], visit.points);
    }
    if (result.penaltyPoints > 0) {
      visit.tokens.push({ kind: 'penalty', points: result.penaltyPoints, recipient: 1 - frame.striker });
    }
    if (result.switchTurn) this.switchTurn(frame.striker, 1 - frame.striker, '交换击球权');
  }

  switchTurn(from: number, to: number, reason: string): void {
    const visit = this.visit(from);
    visit.tokens.push({ kind: 'switch', to, reason });
    visit.ended = true;
  }

  snapshot(): FrameVisit[] {
    return this.visits.map(v => ({ ...v, tokens: v.tokens.map(token => ({ ...token })) }));
  }
}
