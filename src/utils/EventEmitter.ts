/**
 * 简易事件总线 / Simple Event Eitter
 *
 * 用于游戏各系统之间的松耦合通信
 * Used for loosely coupled communication between game systems
 */

type Callback = (...args: unknown[]) => void;

export class EventEmitter {
  private listeners: Map<string, Set<Callback>> = new Map();

  /** 注册事件监听 / Register event listener */
  on(event: string, callback: Callback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /** 移除事件监听 / Remove event listener */
  off(event: string, callback: Callback): void {
    this.listeners.get(event)?.delete(callback);
  }

  /** 触发事件 / Emit event */
  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach(cb => {
      try {
        cb(...args);
      } catch (e) {
        console.error(`Error in event listener for '${event}':`, e);
      }
    });
  }

  /** 注册一次性事件监听 / Register one-time event listener */
  once(event: string, callback: Callback): void {
    const wrapper = (...args: unknown[]) => {
      this.off(event, wrapper);
      callback(...args);
    };
    this.on(event, wrapper);
  }

  /** 移除所有事件监听 / Remove all listeners */
  clear(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

/** 全局事件总线 / Global event bus */
export const gameEvents = new EventEmitter();
