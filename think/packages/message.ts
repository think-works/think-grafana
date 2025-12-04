import { isDebugger } from './detection';

const appName = 'think-grafana';

export const uuid4 = () => {
  const crypto = window.crypto;

  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';

  if (crypto?.getRandomValues) {
    return template.replace(/[xy]/g, (c) => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] & 0xf;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  return template.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

// #region Grafana 消息

export type EventData = {
  /** 消息 ID */
  id: string;
  /** 事件类型 */
  type: string;
  /** 确认 ID */
  ackId?: string;
  /** 事件负载 */
  payload?: Record<string, unknown>;
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
  private targetOrigin: string = isDebugger() ? '*' : window.location.origin;
  private handlers: Record<string, EventHandler[] | undefined> = {};

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
    const { ackId, type, payload } = data || {};

    if (isDebugger()) {
      // eslint-disable-next-line no-console
      console.debug(`[${appName}] receive message`, data, event);
    }

    if (this.targetOrigin !== '*' && this.targetOrigin !== origin) {
      return;
    }

    const list = this.handlers[type];
    if (!list?.length) {
      return;
    }

    // 确认消息
    if (ackId) {
      this.sendMessage(ackId);
    }

    list.forEach((handler) => {
      if (typeof handler === 'function') {
        handler(payload);
      }
    });
  };

  /** 发送消息 */
  public sendMessage(
    type: EventData['type'],
    payload?: EventData['payload'],
    options?: {
      clearPayload?: boolean;
      callback?: (payload?: EventData['payload']) => void;
    }
  ) {
    const { clearPayload, callback } = options || {};
    const cleanPayload = clearPayload && payload ? JSON.parse(JSON.stringify(payload)) : payload;

    const messageId = `message-${uuid4()}`;
    const data: EventData = {
      id: messageId,
      type,
      payload: cleanPayload,
    };

    // 需要确认
    if (callback) {
      const ackId = `ack:${messageId}`;
      data.ackId = ackId;

      const ackHandler: EventHandler = (...rest) => {
        this.off(ackId, ackHandler);
        callback(...rest);
      };
      this.on(ackId, ackHandler);
    }

    if (isDebugger()) {
      // eslint-disable-next-line no-console
      console.debug(`[${appName}] send message`, data, options);
    }

    this.targetWindow.postMessage(data, this.targetOrigin);
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

// #endregion
