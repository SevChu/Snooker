/**
 * UI 管理器 / UI Manager
 *
 * 统一管理所有 UI 组件的显示/隐藏和更新
 * Manages display/hide and updates for all UI components
 */

import {
  GameMode,
  AIDifficulty,
  GameConfig,
  FrameState,
  MatchState,
} from '../types';
import { framesToWin, isValidFrameCount } from '../game/MatchFormat';
import { version } from '../../package.json';
import { remainingPoints } from '../game/RemainingPoints';
import type { FrameSummary, VisitToken } from '../game/FrameRecord';

export class UIManager {
  // DOM 元素引用 / DOM element references
  private mainMenu: HTMLElement;
  private scoreboard: HTMLElement;
  private spinSelector: HTMLElement;
  private infoMessage: HTMLElement;
  private gameOver: HTMLElement;

  // 菜单选择状态 / Menu selection state
  private selectedMode: GameMode = GameMode.PASS_PLAY;
  private selectedDifficulty: AIDifficulty = AIDifficulty.MEDIUM;
  private selectedFrames: number = 1;

  // 回调 / Callbacks
  private onStartGame: ((config: GameConfig) => void) | null = null;
  private onPlayAgain: (() => void) | null = null;
  private onBackToMenu: (() => void) | null = null;
  private onPause: (() => void) | null = null;
  private onResume: (() => void) | null = null;
  private onNextFrame: (() => void) | null = null;
  private pauseDialog = document.getElementById('pause-dialog') as HTMLDialogElement;
  private frameDialog = document.getElementById('frame-dialog') as HTMLDialogElement;
  private summaryComplete = false;

  constructor() {
    this.mainMenu = document.getElementById('main-menu')!;
    this.scoreboard = document.getElementById('scoreboard')!;
    this.spinSelector = document.getElementById('spin-selector')!;
    this.infoMessage = document.getElementById('info-message')!;
    this.gameOver = document.getElementById('game-over')!;
    document.getElementById('game-version')!.textContent = `v${version}`;

    this.setupMenuButtons();
    document.getElementById('btn-pause')!.addEventListener('click', () => this.onPause?.());
    document.getElementById('btn-resume')!.addEventListener('click', () => this.onResume?.());
    document.getElementById('btn-pause-exit')!.addEventListener('click', () => this.onBackToMenu?.());
    document.getElementById('btn-frame-exit')!.addEventListener('click', () => this.onBackToMenu?.());
    document.getElementById('btn-frame-continue')!.addEventListener('click', () => {
      this.frameDialog.close();
      if (this.summaryComplete) this.onPlayAgain?.(); else this.onNextFrame?.();
    });
    this.pauseDialog.addEventListener('cancel', event => { event.preventDefault(); this.onResume?.(); });
    this.frameDialog.addEventListener('cancel', event => event.preventDefault());
    window.addEventListener('keydown', event => {
      if (event.code === 'Escape' && !event.repeat && !this.pauseDialog.open && !this.frameDialog.open) {
        event.preventDefault(); this.onPause?.();
      }
    });
  }

  /** 设置菜单按钮 / Setup menu buttons */
  private setupMenuButtons(): void {
    // 模式选择 / Mode selection
    document.getElementById('btn-mode-ai')?.addEventListener('click', () => {
      this.selectedMode = GameMode.VS_AI;
      this.updateButtonGroup('data-mode');
      document.getElementById('difficulty-section')!.style.display = 'block';
    });
    document.getElementById('btn-mode-pvp')?.addEventListener('click', () => {
      this.selectedMode = GameMode.PASS_PLAY;
      this.updateButtonGroup('data-mode');
      document.getElementById('difficulty-section')!.style.display = 'none';
    });

    // 难度选择 / Difficulty selection
    document.getElementById('btn-diff-easy')?.addEventListener('click', () => {
      this.selectedDifficulty = AIDifficulty.EASY;
      this.updateButtonGroup('data-diff');
    });
    document.getElementById('btn-diff-medium')?.addEventListener('click', () => {
      this.selectedDifficulty = AIDifficulty.MEDIUM;
      this.updateButtonGroup('data-diff');
    });
    document.getElementById('btn-diff-hard')?.addEventListener('click', () => {
      this.selectedDifficulty = AIDifficulty.HARD;
      this.updateButtonGroup('data-diff');
    });

    // 局数选择 / Frames selection
    const framesInput = document.getElementById('total-frames') as HTMLInputElement;
    framesInput.addEventListener('input', () => this.updateFrameSettings());
    this.updateFrameSettings();

    // 开始按钮 / Start button
    document.getElementById('btn-start')?.addEventListener('click', () => {
      if (!this.updateFrameSettings()) return;
      const config: GameConfig = {
        mode: this.selectedMode,
        difficulty: this.selectedDifficulty,
        totalFrames: this.selectedFrames,
        player1Name: 'Player 1',
        player2Name: this.selectedMode === GameMode.VS_AI ? 'AI' : 'Player 2',
      };
      this.onStartGame?.(config);
    });

    // 游戏结束按钮 / Game over buttons
    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      this.onPlayAgain?.();
    });
    document.getElementById('btn-back-menu')?.addEventListener('click', () => {
      this.onBackToMenu?.();
    });
  }

  private updateFrameSettings(): boolean {
    const input = document.getElementById('total-frames') as HTMLInputElement;
    const valid = isValidFrameCount(input.valueAsNumber);
    this.selectedFrames = input.valueAsNumber;
    input.setAttribute('aria-invalid', String(!valid));
    input.setCustomValidity(valid ? '' : '请输入正奇数，例如 9 或 35');
    (document.getElementById('btn-start') as HTMLButtonElement).disabled = !valid;
    const hint = document.getElementById('match-format-hint')!;
    hint.textContent = valid
      ? `${this.selectedFrames} 局 ${framesToWin(this.selectedFrames)} 胜`
      : '请输入正奇数，例如 9 或 35；不能为偶数、小数或空值';
    hint.dataset.invalid = String(!valid);
    return valid;
  }

  /** 更新按钮组选中状态 / Update button group selection */
  private updateButtonGroup(dataAttr: string): void {
    const buttons = document.querySelectorAll(`.menu-btn[${dataAttr}]`);
    buttons.forEach(btn => {
      btn.classList.remove('selected');
      btn.setAttribute('aria-pressed', 'false');
    });

    let selectedValue: string;
    switch (dataAttr) {
      case 'data-mode': selectedValue = this.selectedMode; break;
      case 'data-diff': selectedValue = this.selectedDifficulty; break;
      default: return;
    }

    const selected = document.querySelector(`.menu-btn[${dataAttr}="${selectedValue}"]`);
    selected?.classList.add('selected');
    selected?.setAttribute('aria-pressed', 'true');
  }

  /** 设置回调 / Set callbacks */
  setCallbacks(callbacks: {
    onStartGame: (config: GameConfig) => void;
    onPlayAgain: () => void;
    onBackToMenu: () => void;
    onPause: () => void;
    onResume: () => void;
    onNextFrame: () => void;
  }): void {
    this.onStartGame = callbacks.onStartGame;
    this.onPlayAgain = callbacks.onPlayAgain;
    this.onBackToMenu = callbacks.onBackToMenu;
    this.onPause = callbacks.onPause; this.onResume = callbacks.onResume;
    this.onNextFrame = callbacks.onNextFrame;
  }

  /** 显示主菜单 / Show main menu */
  showMenu(): void {
    this.pauseDialog.close(); this.frameDialog.close();
    document.getElementById('btn-pause')!.hidden = true;
    this.mainMenu.style.display = 'flex';
    this.scoreboard.style.display = 'none';
    this.spinSelector.style.display = 'none';
    this.gameOver.style.display = 'none';
    this.hideMessage();
  }

  /** 隐藏主菜单，显示游戏 UI / Hide menu, show game UI */
  showGame(match: MatchState): void {
    this.pauseDialog.close(); this.frameDialog.close();
    document.getElementById('btn-pause')!.hidden = false;
    this.mainMenu.style.display = 'none';
    this.scoreboard.style.display = 'block';
    this.spinSelector.style.display = 'block';
    this.gameOver.style.display = 'none';

    // 更新玩家名 / Update player names
    document.getElementById('player1-name')!.textContent = match.playerNames[0];
    document.getElementById('player2-name')!.textContent = match.playerNames[1];
    this.updateScoreboard(match);
  }

  /** 更新计分板 / Update scoreboard */
  updateScoreboard(match: MatchState): void {
    const frame = match.frame;
    document.getElementById('player1-points')!.textContent = String(frame.scores[0]);
    document.getElementById('player2-points')!.textContent = String(frame.scores[1]);

    // 高亮当前击球者 / Highlight current striker
    const p1 = document.getElementById('player1-score')!;
    const p2 = document.getElementById('player2-score')!;
    p1.classList.toggle('active', frame.striker === 0);
    p2.classList.toggle('active', frame.striker === 1);

    // 更新局信息 / Update frame info
    document.getElementById('frame-info')!.textContent =
      `第 ${match.currentFrame} 局 · ${match.totalFrames} 局 ${framesToWin(match.totalFrames)} 胜 | ` +
      `Frames: ${match.framesWon[0]}-${match.framesWon[1]} | ` +
      `Points Remained: ${remainingPoints(frame)} | Break: ${frame.currentBreak}` +
      (frame.respottedBlack ? ' | 平分争黑' :
        Math.abs(frame.scores[0] - frame.scores[1]) > remainingPoints(frame) ? ' | 已超分' :
        Math.abs(frame.scores[0] - frame.scores[1]) === remainingPoints(frame) ? ' | 延分 · 清台可追平' : '');
  }

  showPause(): void {
    if (!this.pauseDialog.open) this.pauseDialog.showModal();
    document.getElementById('btn-resume')!.focus();
  }

  hidePause(): void { this.pauseDialog.close(); }

  showFrameSummary(summary: FrameSummary): void {
    this.hideMessage(); this.gameOver.style.display = 'none';
    document.getElementById('btn-pause')!.hidden = true;
    this.summaryComplete = summary.matchComplete;
    document.getElementById('frame-result-title')!.textContent = `第 ${summary.frameNumber} 局结算`;
    document.getElementById('frame-result-subtitle')!.textContent =
      `${summary.playerNames[summary.winner]} ${summary.matchComplete ? '赢得比赛' : '赢得本局'} · 大比分 ${summary.framesWon[0]} : ${summary.framesWon[1]}`;
    for (const player of [0, 1]) {
      document.getElementById(`frame-player-${player}`)!.textContent = summary.playerNames[player];
      document.getElementById(`frame-score-${player}`)!.textContent = String(summary.scores[player]);
      document.getElementById(`frame-highest-${player}`)!.textContent = String(summary.highestBreaks[player]);
      document.getElementById(`frame-card-${player}`)!.classList.toggle('winner', player === summary.winner);
    }
    const history = document.getElementById('frame-history')!;
    history.replaceChildren();
    const names: Record<string, string> = { red: '红球', yellow: '黄球', green: '绿球', brown: '棕球',
      blue: '蓝球', pink: '粉球', black: '黑球' };
    summary.visits.forEach((visit, index) => {
      const row = document.createElement('li'); row.className = 'visit-row';
      const who = document.createElement('div'); who.className = 'visit-player';
      who.textContent = `${String(index + 1).padStart(2, '0')} · ${summary.playerNames[visit.player]}`;
      const sequence = document.createElement('div'); sequence.className = 'visit-sequence';
      visit.tokens.forEach((token: VisitToken) => {
        const ball = document.createElement('span'); ball.className = 'result-ball';
        let label: string;
        if (token.kind === 'pot') {
          ball.classList.add(token.ball);
          label = names[token.ball] + (token.freeBall ? '（自由球，按目标球计分）' : '');
          if (token.freeBall) ball.classList.add('free-ball');
        } else if (token.kind === 'penalty') {
          ball.classList.add('cue'); ball.textContent = String(token.points);
          label = `犯规罚 ${token.points} 分，计入 ${summary.playerNames[token.recipient]}`;
        } else {
          ball.classList.add('cue', 'turn-marker'); ball.textContent = '↻';
          label = `${token.reason} → ${summary.playerNames[token.to]}`;
        }
        ball.setAttribute('role', 'img'); ball.setAttribute('aria-label', label); ball.title = label;
        sequence.appendChild(ball);
      });
      const points = document.createElement('span'); points.className = 'visit-points';
      points.textContent = `${visit.points} 分`;
      row.append(who, sequence, points); history.appendChild(row);
    });
    if (!summary.visits.length) {
      const empty = document.createElement('li'); empty.textContent = '本局暂无击球记录'; history.appendChild(empty);
    }
    document.getElementById('btn-frame-continue')!.textContent = summary.matchComplete ? '再来一场' : '下一局';
    if (!this.frameDialog.open) this.frameDialog.showModal();
    this.frameDialog.scrollTop = 0;
    document.getElementById('btn-frame-continue')!.focus({ preventScroll: true });
  }

  /** 显示信息消息 / Show info message */
  showMessage(title: string, body: string, buttons?: Array<{ text: string; onClick: () => void }>): void {
    this.infoMessage.classList.remove('placement-hint');
    document.getElementById('msg-title')!.textContent = title;
    document.getElementById('msg-body')!.textContent = body;

    const btnContainer = document.getElementById('msg-buttons')!;
    btnContainer.innerHTML = '';

    if (buttons) {
      for (const btn of buttons) {
        const button = document.createElement('button');
        button.textContent = btn.text;
        button.addEventListener('click', () => {
          this.hideMessage();
          btn.onClick();
        });
        btnContainer.appendChild(button);
      }
    } else {
      // 默认 OK 按钮 / Default OK button
      const okBtn = document.createElement('button');
      okBtn.textContent = 'OK';
      okBtn.addEventListener('click', () => this.hideMessage());
      btnContainer.appendChild(okBtn);
    }

    this.infoMessage.style.display = 'block';
  }

  /** Placement is an instruction banner, not a modal that intercepts table clicks. */
  showPlacementHint(): void {
    this.showMessage('放置白球', '点击 D 区内的空位放置白球', []);
    this.infoMessage.classList.add('placement-hint');
  }

  /** 隐藏信息消息 / Hide info message */
  hideMessage(): void {
    this.infoMessage.style.display = 'none';
  }

  /** 显示游戏结束 / Show game over */
  showGameOver(winner: number, scores: [number, number], framesWon: [number, number], playerNames: [string, string]): void {
    document.getElementById('game-over-title')!.textContent =
      `${playerNames[winner]} 获胜! / ${playerNames[winner]} Wins!`;
    document.getElementById('game-over-score')!.textContent =
      `${playerNames[0]}: ${framesWon[0]} frames | ${playerNames[1]}: ${framesWon[1]} frames\n` +
      `Last frame: ${scores[0]} - ${scores[1]}`;
    this.gameOver.style.display = 'flex';
  }

  /** 隐藏游戏 UI / Hide game UI */
  hideGame(): void {
    this.scoreboard.style.display = 'none';
    this.spinSelector.style.display = 'none';
  }
}
