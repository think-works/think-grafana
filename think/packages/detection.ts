export const THINK_SEARCH_KEY = 'think-config';

export type ThinkConfig = {
  /** 调试模式 */
  debugger?: boolean;
  /** 被 iframe 内嵌 */
  embedded?: boolean;
  /** 隐藏时间控制器 */
  hideTime?: boolean;
};

// 三层配置缓存
let prevSearch: string | null;
let prevParams: string | null;
let prevConfig: ThinkConfig;

/**
 * 实时读取配置
 */
const getThinkConfig = () => {
  if (prevSearch === location.search) {
    return prevConfig;
  } else {
    prevSearch = location.search;
  }

  const search = new URLSearchParams(location.search);
  const params = search.get(THINK_SEARCH_KEY);

  if (prevParams === params) {
    return prevConfig;
  } else {
    prevParams = params;
  }

  if (params) {
    try {
      const _params = decodeURIComponent(params);
      const config = JSON.parse(_params);
      prevConfig = config;

      return config;
    } catch (error) {
      console.error(`[think-grafana] invalid "${THINK_SEARCH_KEY}" params: ${params}`, error);
    }
  }
};

/**
 * 调试模式
 */
export const isDebugger = () => {
  const config = getThinkConfig();
  return !!config?.debugger;
};

/**
 * 被 iframe 内嵌
 */
export const isEmbedded = () => {
  const config = getThinkConfig();
  return !!config?.embedded;
};

/**
 * 隐藏时间控制器
 */
export const isHideTime = () => {
  const config = getThinkConfig();
  return !!config?.hideTime;
};
