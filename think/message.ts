/**
 * 注意：
 * 本文件需要在主应用和 Granafa 之间保持同步
 */

// #region 托管其他属性以便跨应用重用

export type ThinkConfig = {
  /** 被 iframe 内嵌 */
  embedded?: boolean;
  /** 隐藏时间控制器 */
  hideTime?: boolean;
};

/** 约定的主应用配置 key */
export const THINK_SEARCH_KEY = "think-config";

// #endregion

export type EventHandler = (message?: any, ...args: any) => any;

export type Options = {
  /** 目标窗口 */
  targetWindow?: typeof window;
  /** 目标域 */
  targetOrigin?: string;
  /** 目标唯一标识 */
  targetId?: string;
  /** 实例唯一标识 */
  instanceId?: string;
};

type InnerMessage = {
  /** 消息通道 */
  channel: string;
  /** 发送者 */
  from: string;
  /** 接收者(未指定则发送广播) */
  to?: string;
  /** 消息类型  */
  type: string;
  /** 消息内容 */
  message?: any;
};

/** 约定的主应用唯一标识 */
export const THINK_APP_ID = "think-load-f2e";

/** 约定的消息通道识别码 */
const MESSAGE_CHANNEL = "think-grafana-message";

export class ThinkGrafanaMessage {
  /** 目标窗口 */
  private targetWindow = window;
  /** 目标域 */
  private targetOrigin = location.origin;
  /** 目标唯一标识(仅接收来自该目标的消息，且仅发送消息至该目标。未指定则发送或接收广播。) */
  private targetId = "";
  /** 实例唯一标识 */
  private instanceId = `instance-${Date.now()}-${Math.random()}`;
  /** 事件集合 */
  private events: Record<string, EventHandler[]> = {};

  constructor(options?: Options) {
    // 初始化配置
    this.targetWindow = options?.targetWindow || this.targetWindow;
    this.targetOrigin = options?.targetOrigin || this.targetOrigin;
    this.targetId = options?.targetId || this.targetId;
    this.instanceId = options?.instanceId || this.instanceId;

    // 启动监听
    this.targetWindow.addEventListener("message", this.receiveMessage, {
      passive: true,
    });
    // 启动回显
    this.on("ping", this.echoHandler);
    // 上线通知
    this.sendMessage("online", this.instanceId);
  }

  /** 销毁 */
  destroy = () => {
    // 停止监听
    this.targetWindow.removeEventListener("message", this.receiveMessage);
    // 停止回显
    this.off("ping", this.echoHandler);
    // 下线通知
    this.sendMessage("offline", this.instanceId);
    // 清理监听器
    this.events = {};
  };

  /* 注册事件 */
  on = (type: string, handler: EventHandler) => {
    let list = this.events[type];

    if (handler) {
      list = (list || []).concat(handler);
    }

    this.events[type] = list;
  };

  /* 反注册事件 */
  off = (type: string, handler: EventHandler) => {
    let list = this.events[type];

    if (handler) {
      list = (list || []).filter((x) => x !== handler);
    }

    this.events[type] = list;
  };

  /* 触发事件 */
  private emit = (type: string, ...arg: Parameters<EventHandler>) => {
    const list = this.events[type];

    (list || []).map((handler) => {
      typeof handler === "function" && handler(...arg);
    });
  };

  /** 发送消息 */
  sendMessage = (type: string, message?: any, to = this.targetId) => {
    const payload: InnerMessage = {
      channel: MESSAGE_CHANNEL,
      from: this.instanceId,
      to,
      type,
      message,
    };
    this.targetWindow.postMessage(payload, this.targetOrigin);
  };

  /** 接收消息 */
  private receiveMessage = (e: MessageEvent<InnerMessage>) => {
    const { origin, data } = e;
    const { channel, from, to, type, message } = data || {};

    // 检查域和通道
    if (origin !== this.targetOrigin || channel !== MESSAGE_CHANNEL) {
      return;
    }

    // 忽略自己发送的消息
    if (from === this.instanceId) {
      return;
    }

    // 过滤发件人
    if (this.targetId && from !== this.targetId) {
      return;
    }

    // 过滤收件人
    if (to && to !== this.instanceId) {
      return;
    }

    if (type) {
      this.emit(type, message, e);
    }
  };

  /** ping/pong 回显 */
  private echoHandler = (message?: any) => {
    this.sendMessage("pong", message);
  };

  /** 检测目标是否已上线 */
  targetReady = (
    /** 检测结果 */
    readyCb: (ready: boolean) => void,
    {
      /** 重试间隔 */
      retryInterval = 200,
      /** 重试次数 */
      retryCount = 0,
    } = {}
  ) => {
    let timer: any;
    let count = 0;
    let pingMsg: string;

    const clear = () => {
      clearTimeout(timer);
      this.off("pong", pong);
    };

    const pong = (echoMsg: any) => {
      if (echoMsg !== pingMsg) {
        return;
      }

      clear();
      readyCb && readyCb(true);
    };

    const ping = () => {
      // 下一次重试时再清理
      if (count++ > retryCount) {
        clear();
        readyCb && readyCb(false);
        return;
      }

      pingMsg = `ping-${Date.now()}-${Math.random()}`;
      this.sendMessage("ping", pingMsg);

      timer = setTimeout(ping, retryInterval);
    };

    this.on("pong", pong);
    ping();

    return () => {
      clear();
    };
  };
}
