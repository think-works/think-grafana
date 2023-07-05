export type ThinkConfig = {
  embedded?: boolean;
  editable?: boolean;
};

const THINK_SEARCH_KEY = 'think-config';

// 单例缓存一下
let prevSearch: string | null;
let prevParams: string | null;
let prevConfig: ThinkConfig;

// 实时读取配置
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
 * 被 iframe 内嵌
 */
export const isEmbedded = () => {
  const config = getThinkConfig();
  return !!config?.embedded;
};

/**
 * 允许编辑部分内容
 */
export const isEditable = () => {
  const config = getThinkConfig();
  return !!config?.editable;
};
