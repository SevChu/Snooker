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

  constructor() {
    this.mainMenu = document.getElementById('main-menu')!;
    this.scoreboard = document.getElementById('scoreboard')!;
    this.spinSelector = document.getElementById('spin-selector')!;
    this.infoMessage = document.getElementById('info-message')!;
    this.gameOver = document.getElementById('game-over')!;

    this.setupMenuButtons();
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
    document.getElementById('btn-frames-1')?.addEventListener('click', () => {
      this.selectedFrames = 1;
      this.updateButtonGroup('data-frames');
    });
    document.getElementById('btn-frames-3')?.addEventListener('click', () => {
      this.selectedFrames = 3;
      this.updateButtonGroup('data-frames');
    });
    document.getElementById('btn-frames-5')?.addEventListener('click', () => {
      this.selectedFrames = 5;
      this.updateButtonGroup('data-frames');
    });
    document.getElementById('btn-frames-7')?.addEventListener('click', () => {
      this.selectedFrames = 7;
      this.updateButtonGroup('data-frames');
    });

    // 开始按钮 / Start button
    document.getElementById('btn-start')?.addEventListener('click', () => {
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

  /** 更新按钮组选中状态 / Update button group selection */
  private updateButtonGroup(dataAttr: string): void {
    const buttons = document.querySelectorAll(`.menu-btn[${dataAttr}]`);
    buttons.forEach(btn => btn.classList.remove('selected'));

    let selectedValue: string;
    switch (dataAttr) {
      case 'data-mode': selectedValue = this.selectedMode; break;
      case 'data-diff': selectedValue = this.selectedDifficulty; break;
      case 'data-frames': selectedValue = String(this.selectedFrames); break;
      default: return;
    }

    const selected = document.querySelector(`.menu-btn[${dataAttr}="${selectedValue}"]`);
    selected?.classList.add('selected');
  }

  /** 设置回调 / Set callbacks */
  setCallbacks(callbacks: {
    onStartGame: (config: GameConfig) => void;
    onPlayAgain: () => void;
    onBackToMenu: () => void;
  }): void {
    this.onStartGame = callbacks.onStartGame;
    this.onPlayAgain = callbacks.onPlayAgain;
    this.onBackToMenu = callbacks.onBackToMenu;
  }

  /** 显示主菜单 / Show main menu */
  showMenu(): void {
    this.mainMenu.style.display = 'flex';
    this.scoreboard.style.display = 'none';
    this.spinSelector.style.display = 'none';
    this.gameOver.style.display = 'none';
    this.hideMessage();
  }

  /** 隐藏主菜单，显示游戏 UI / Hide menu, show game UI */
  showGame(match: MatchState): void {
    this.mainMenu.style.display = 'none';
    this.scoreboard.style.display = 'block';
    this.spinSelector.style.display = 'block';
    this.gameOver.style.display = 'none';

    // 更新玩家名 / Update player names
    document.getElementById('player1-name')!.textContent = match.playerNames[0];
    document.getElementById('player2-name')!.textContent = match.playerNames[1];
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
    const redsOnTable = frame.balls.filter(
      b => b.type === 'red' && b.isOnTable && !b.isPotted
    ).length;
    document.getElementById('frame-info')!.textContent =
      `Frame ${match.currentFrame} / ${match.totalFrames} | ` +
      `Frames: ${match.framesWon[0]}-${match.framesWon[1]} | ` +
      `Reds: ${redsOnTable} | Break: ${frame.currentBreak}`;
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
