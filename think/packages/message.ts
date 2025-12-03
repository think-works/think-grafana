import { isDebugger } from './detection';

const appName = 'think-grafana';

export type EventData = {
  /** 事件类型 */
  type: string;
  /** 事件负载 */
  payload?: Record<string, any>;
};

export type EventHandler = (payload?: EventData['payload']) => void;

export type MessageOptions = {
  /** 源窗口 */
  sourceWindow?: Window;
  /** 目标窗口 */
  targetWindow?: Window;
  /** 目标域 */
  targetOrigin?: string;
};

export class GrafanaMessage {
  private sourceWindow: Window = window;
  private targetWindow: Window = window;
  private targetOrigin: string = isDebugger() ? "*" : window.location.origin;
  private handlers: Record<string, EventHandler[]> = {};

  constructor(options?: MessageOptions) {
    this.sourceWindow = options?.sourceWindow || this.sourceWindow;
    this.targetWindow = options?.targetWindow || this.targetWindow;
    this.targetOrigin = options?.targetOrigin || this.targetOrigin;

    this.sourceWindow.addEventListener('message', this.handleMessage);
  }

  /** 销毁 */
  public destroy() {
    this.sourceWindow.removeEventListener('message', this.handleMessage);
    this.handlers = {};
  }

  /** 接收消息 */
  private handleMessage = (event: MessageEvent<EventData>) => {
    const { origin, data } = event;
    const { type, payload } = data || {};

    if (isDebugger()) {
      // eslint-disable-next-line no-console
      console.debug(`[${appName}] receive message`, data, event);
    }

    if (this.targetOrigin !== '*' && this.targetOrigin !== origin) {
      return;
    }

    const list = this.handlers[type];
    (list || []).forEach((handler) => {
      if (typeof handler === 'function') {
        handler(payload);
      }
    });
  };

  /** 发送消息 */
  public sendMessage(type: string, payload?: Record<string, any>, clearPayload?: boolean) {
    const cleanPayload = clearPayload && payload ? JSON.parse(JSON.stringify(payload)) : payload;

    if (isDebugger()) {
      // eslint-disable-next-line no-console
      console.debug(`[${appName}] send message`, {type, payload, cleanPayload});
    }

    this.targetWindow.postMessage({ type, payload: cleanPayload }, this.targetOrigin);
  }

  /* 注册事件 */
  public on(type: string, handler: EventHandler) {
    let list = this.handlers[type];

    if (handler) {
      list = (list || []).concat(handler);
    }

    this.handlers[type] = list;
  }

  /* 反注册事件 */
  public off(type: string, handler: EventHandler) {
    let list = this.handlers[type];

    if (handler) {
      list = (list || []).filter((x) => x !== handler);
    }

    this.handlers[type] = list;
  }
}
