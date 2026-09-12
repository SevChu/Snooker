/**
 * 旋转选择器 / Spin Selector
 *
 * UI 组件: 圆形白球截面图，玩家点击位置决定旋转
 * UI component: circular cue ball cross-section, click position determines spin
 *
 * 操作方式 / Operation:
 * - 点击圆形区域选择击球点
 * - 中心 = 无旋转 / Center = no spin
 * - 上方 = 上旋 (高杆) / Top = topspin (follow)
 * - 下方 = 下旋 (低杆) / Bottom = backspin (draw)
 * - 左侧 = 左塞 / Left = left side spin
 * - 右侧 = 右塞 / Right = right side spin
 */

import { SpinParams } from '../types';

export class SpinSelector {
  /** 当前旋转参数 / Current spin parameters */
  private spin: SpinParams = { side: 0, vertical: 0 };

  /** Canvas 2D 上下文 / Canvas 2D context */
  private ctx: CanvasRenderingContext2D;

  /** Canvas 元素 / Canvas element */
  private canvas: HTMLCanvasElement;

  /** 容器元素 / Container element */
  private container: HTMLDivElement;

  /** 圆心坐标 / Center coordinates */
  private centerX: number;
  private centerY: number;

  /** 圆半径 (像素) / Circle radius (pixels) */
  private radius: number;

  constructor() {
    this.container = document.getElementById('spin-selector') as HTMLDivElement;
    this.canvas = document.getElementById('spin-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;
    this.radius = this.canvas.width / 2 - 10;

    this.setupEventListeners();
    this.draw();
  }

  /** 设置事件监听 / Setup event listeners */
  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', (e: MouseEvent) => {
      this.handleClick(e);
    });

    this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
      if (e.buttons === 1) { // 左键拖拽 / Left button drag
        this.handleClick(e);
      }
    });

    // 双击重置为中心 (无旋转) / Double-click to reset to center (no spin)
    this.canvas.addEventListener('dblclick', () => {
      this.spin = { side: 0, vertical: 0 };
      this.draw();
    });
  }

  /** 处理点击 / Handle click */
  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const pixelX = (e.clientX - rect.left) * scaleX;
    const pixelY = (e.clientY - rect.top) * scaleY;

    // 转换为归一化坐标 (-1 ~ 1) / Convert to normalized coordinates (-1 ~ 1)
    let normX = (pixelX - this.centerX) / this.radius;
    let normY = (pixelY - this.centerY) / this.radius;

    // 限制在圆内 / Clamp to circle
    const dist = Math.sqrt(normX * normX + normY * normY);
    if (dist > 1) {
      normX /= dist;
      normY /= dist;
    }

    this.spin = {
      side: normX,     // 正=右塞, 负=左塞 / Positive=right, Negative=left
      vertical: -normY, // 正=上旋, 负=下旋 (Y轴翻转) / Positive=top, Negative=bottom
    };

    this.draw();
  }

  /** 绘制旋转选择器 / Draw spin selector */
  draw(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 清除画布 / Clear canvas
    ctx.clearRect(0, 0, w, h);

    // 绘制白球底圆 / Draw cue ball base circle
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245, 245, 240, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制十字准线 / Draw crosshair lines
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
    ctx.lineWidth = 1;
    // 水平线 / Horizontal line
    ctx.moveTo(this.centerX - this.radius, this.centerY);
    ctx.lineTo(this.centerX + this.radius, this.centerY);
    // 垂直线 / Vertical line
    ctx.moveTo(this.centerX, this.centerY - this.radius);
    ctx.lineTo(this.centerX, this.centerY + this.radius);
    ctx.stroke();

    // 绘制标签 / Draw labels
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(100, 100, 100, 0.7)';
    ctx.textAlign = 'center';
    ctx.fillText('Top', this.centerX, this.centerY - this.radius + 15);
    ctx.fillText('Bottom', this.centerX, this.centerY + this.radius - 8);
    ctx.textAlign = 'left';
    ctx.fillText('L', this.centerX - this.radius + 5, this.centerY + 4);
    ctx.textAlign = 'right';
    ctx.fillText('R', this.centerX + this.radius - 5, this.centerY + 4);

    // 绘制击球点标记 / Draw hit point marker
    const markerX = this.centerX + this.spin.side * this.radius;
    const markerY = this.centerY - this.spin.vertical * this.radius;

    // 外圈 / Outer ring
    ctx.beginPath();
    ctx.arc(markerX, markerY, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 50, 50, 0.8)';
    ctx.fill();

    // 内点 / Inner dot
    ctx.beginPath();
    ctx.arc(markerX, markerY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  /** 获取当前旋转参数 / Get current spin parameters */
  getSpin(): SpinParams {
    return { ...this.spin };
  }

  /** 设置旋转参数 / Set spin parameters */
  setSpin(spin: SpinParams): void {
    this.spin = { ...spin };
    this.draw();
  }

  /** 重置旋转 / Reset spin */
  reset(): void {
    this.spin = { side: 0, vertical: 0 };
    this.draw();
  }

  /** 显示旋转选择器 / Show spin selector */
  show(): void {
    this.container.style.display = 'block';
  }

  /** 隐藏旋转选择器 / Hide spin selector */
  hide(): void {
    this.container.style.display = 'none';
  }
}
