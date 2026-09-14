/**
 * 输入管理 / Input Manager
 *
 * 操控方式 / Control scheme:
 * - 鼠标拖动: 瞄准方向 (拖动向量决定方向) / Mouse drag: aim direction
 * - 鼠标滚轮: 调整力度 / Mouse wheel: adjust power
 * - 空格或出杆按钮: 击球 / Space or shoot button: fire shot
 * - D 区放置: 在 PLACING 状态下点击 D 区放置白球 / D-zone placement
 *
 * 同时提供键盘辅助 / Also provides keyboard assistance
 */

export class InputManager {
  /** 鼠标归一化位置 (-1~1) / Normalized mouse position */
  public mouseX: number = 0;
  public mouseY: number = 0;

  /** 鼠标像素位置 / Mouse pixel position */
  public mousePixelX: number = 0;
  public mousePixelY: number = 0;

  /** 是否按下 / Whether mouse is pressed */
  public mouseDown: boolean = false;

  /** 按下是否发生在游戏画布上 / Whether press originated on game canvas */
  private mouseDownOnCanvas: boolean = false;

  /** 按下时的像素坐标 / Pixel position at press time */
  public pressX: number = 0;
  public pressY: number = 0;

  /** 当前鼠标像素坐标 (按下期间) / Current pixel position during drag */
  public currentX: number = 0;
  public currentY: number = 0;

  /** 拖动增量 (像素, 按下期间) / Drag delta in pixels during drag */
  public dragDeltaX: number = 0;
  public dragDeltaY: number = 0;

  /** 是否正在拖动 / Whether currently dragging */
  public isDragging: boolean = false;

  /** 拖动距离阈值 (像素) / Drag distance threshold in pixels */
  private readonly DRAG_THRESHOLD = 5;

  /** 滚轮增量 (本帧) / Scroll wheel delta this frame */
  public scrollDelta: number = 0;

  /** 是否刚刚点击松开 (非拖动) / Whether just clicked (non-drag release) */
  public justClicked: boolean = false;

  /** 点击位置的像素坐标 / Click position in pixels */
  public clickX: number = 0;
  public clickY: number = 0;

  /** 键盘按键状态 / Keyboard key states */
  private keys: Set<string> = new Set();
  private pressedKeys: Set<string> = new Set();
  private suspended = false;

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    this.keys.clear(); this.pressedKeys.clear();
    this.mouseDown = false; this.mouseDownOnCanvas = false; this.isDragging = false;
    this.resetFrameDeltas();
  }

  /** 绑定的事件处理函数 (用于清理) / Bound event handlers for cleanup */
  private handlers: Array<{ target: EventTarget; event: string; fn: EventListener }> = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.setupEventListeners();
  }

  /** 设置事件监听 / Setup event listeners */
  private setupEventListeners(): void {
    const on = (target: EventTarget, event: string, fn: EventListener) => {
      target.addEventListener(event, fn);
      this.handlers.push({ target, event, fn });
    };

    // 鼠标移动 / Mouse move
    on(window, 'mousemove', ((e: MouseEvent) => {
      if (this.suspended) return;
      this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseY = (e.clientY / window.innerHeight) * 2 - 1;
      this.mousePixelX = e.clientX;
      this.mousePixelY = e.clientY;

      if (this.mouseDown) {
        const movementX = e.clientX - this.currentX;
        const movementY = e.clientY - this.currentY;
        this.currentX = e.clientX;
        this.currentY = e.clientY;
        const dx = this.currentX - this.pressX;
        const dy = this.currentY - this.pressY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > this.DRAG_THRESHOLD) {
          this.isDragging = true;
        }

        // 拖动增量 (每帧重置) / Drag delta per frame
        // No aiming dead zone: even a one-pixel adjustment must reach the controller.
        // The threshold only separates clicks from drags during D-zone placement.
        this.dragDeltaX += movementX;
        this.dragDeltaY += movementY;
      }
    }) as EventListener);

    // 鼠标按下 / Mouse down
    // 仅当按下位置在游戏画布上时才处理，防止 UI 元素 (旋转选择器等) 的点击干扰瞄准
    // Only process when press is on game canvas to prevent UI clicks from affecting aim
    on(window, 'mousedown', ((e: MouseEvent) => {
      if (this.suspended) return;
      if (e.button !== 0) return; // 仅左键 / Left button only
      if (e.target !== this.canvas) return; // 仅画布上的按下 / Only canvas presses
      this.mouseDown = true;
      this.mouseDownOnCanvas = true;
      this.isDragging = false;
      this.pressX = e.clientX;
      this.pressY = e.clientY;
      this.currentX = e.clientX;
      this.currentY = e.clientY;
    }) as EventListener);

    // 鼠标松开 / Mouse up
    on(window, 'mouseup', ((e: MouseEvent) => {
      if (this.suspended) return;
      if (e.button !== 0) return; // 仅左键 / Left button only
      this.mouseDown = false;

      // 如果不是拖动，且按下发生在游戏画布上，则视为点击
      // Only register as click if press originated on game canvas
      if (!this.isDragging && this.mouseDownOnCanvas) {
        this.justClicked = true;
        this.clickX = e.clientX;
        this.clickY = e.clientY;
      }

      this.isDragging = false;
      this.mouseDownOnCanvas = false;
    }) as EventListener);

    // 鼠标滚轮 / Mouse wheel
    on(window, 'wheel', ((e: WheelEvent) => {
      if (this.suspended || !(e.target instanceof Node) ||
          (e.target !== this.canvas && !document.getElementById('shot-controls')?.contains(e.target))) return;
      e.preventDefault();
      // deltaY > 0 表示向下滚动 / deltaY > 0 means scroll down
      this.scrollDelta += e.deltaY;
    }) as EventListener);

    // 键盘 / Keyboard
    on(window, 'keydown', ((e: KeyboardEvent) => {
      if (this.suspended) return;
      if (e.target instanceof HTMLElement && (e.target.closest('dialog') ||
          (e.target.closest('button, summary') && e.code === 'Space'))) return;
      if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
    }) as EventListener);

    on(window, 'keyup', ((e: KeyboardEvent) => {
      this.keys.delete(e.code);
    }) as EventListener);

    on(window, 'blur', (() => {
      this.keys.clear(); this.pressedKeys.clear();
      this.mouseDown = false; this.mouseDownOnCanvas = false; this.isDragging = false;
      this.resetFrameDeltas();
    }) as EventListener);

    // 防止右键菜单 / Prevent context menu
    on(this.canvas, 'contextmenu', ((e: Event) => {
      e.preventDefault();
    }) as EventListener);
  }

  /** 检查按键是否按下 / Check if key is pressed */
  isKeyPressed(code: string): boolean {
    return this.keys.has(code);
  }

  isKeyJustPressed(code: string): boolean { return this.pressedKeys.has(code); }

  /** 获取拖动方向 (归一化, 屏幕坐标) / Get drag direction (normalized, screen coords) */
  getDragDirection(): { x: number; y: number; length: number } | null {
    if (!this.isDragging) return null;
    const dx = this.currentX - this.pressX;
    const dy = this.currentY - this.pressY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < this.DRAG_THRESHOLD) return null;
    return { x: dx / len, y: dy / len, length: len };
  }

  /**
   * 重置每帧增量值 (每帧末尾调用)
   * Reset per-frame delta values (call at end of each frame)
   */
  resetFrameDeltas(): void {
    this.pressedKeys.clear();
    this.scrollDelta = 0;
    this.justClicked = false;
    this.dragDeltaX = 0;
    this.dragDeltaY = 0;
  }

  /** 清理 / Dispose */
  dispose(): void {
    for (const h of this.handlers) {
      h.target.removeEventListener(h.event, h.fn);
    }
    this.handlers = [];
  }
}
