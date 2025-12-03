import { rangeUtil } from '@grafana/data';
import { SceneObjectBase, SceneObjectState, sceneGraph, SceneRefreshPicker, SceneTimePicker } from '@grafana/scenes';

import { GrafanaMessage } from './message';

export interface SceneTimeSyncState extends SceneObjectState {
  timePicker?: SceneTimePicker;
  refreshPicker?: SceneRefreshPicker;
}

export class SceneSync extends SceneObjectBase<SceneTimeSyncState> {
  constructor(state: Partial<SceneTimeSyncState>) {
    super(state);

    this.addActivationHandler(() => this._onActivate());
  }

  private _onActivate() {
    const timeRange = sceneGraph.getTimeRange(this);
    const timePicker = this.state.timePicker;
    const refreshPicker = this.state.refreshPicker;

    const instanceId = `instance-${Date.now()}-${Math.random()}`;
    const message = new GrafanaMessage({
      targetWindow: window.parent,
    });

    // 上线通知
    message.sendMessage('grafana:event:scene:online', { instanceId });

    // #region 监听状态

    // 监听 TimeRange 变化
    const timeRangeSub = timeRange.subscribeToState((state) => {
      const { from, to, value, ...rest } = state;
      message.sendMessage('grafana:event:scene:time-range:state', { from, to, value, ...rest }, true);
    });

    // 监听 TimePicker 变化
    let timePickerSub = timePicker?.subscribeToState((state) => {
      const { hidePicker, ...rest } = state;
      message.sendMessage('grafana:event:scene:time-picker:state', { hidePicker, ...rest }, true);
    });

    // 监听 RefreshPicker 变化
    let refreshPickerSub = refreshPicker?.subscribeToState((state) => {
      const { refresh, ...rest } = state;
      message.sendMessage('grafana:event:scene:refresh-picker:state', { refresh, ...rest }, true);
    });

    // #endregion

    // #region 监听刷新

    // 监听 TimeRange 刷新 (无论是点击刷新按钮还是自动刷新，最终都会调用 timeRange.onRefresh)
    const timeRangeOnRefresh = timeRange.onRefresh;
    timeRange.onRefresh = () => {
      timeRangeOnRefresh.call(timeRange);
      message.sendMessage('grafana:event:scene:time-range:refresh');
    };

    // 监听 RefreshPicker 刷新
    const refreshPickerOnRefresh = refreshPicker?.onRefresh;
    if (refreshPicker && refreshPickerOnRefresh) {
      refreshPicker.onRefresh = () => {
        refreshPickerOnRefresh.call(refreshPicker);
        message.sendMessage('grafana:event:scene:refresh-picker:refresh');
      };
    }

    // #endregion

    // #region 修改状态

    // 修改 TimeRange
    const timeRangeHandler = (payload?: { from?: string; to?: string } & Record<string, any>) => {
      const { from, to, ...rest } = payload || {};

      if (from !== undefined && to !== undefined) {
        const zone = timeRange.getTimeZone();
        const range = rangeUtil.convertRawToRange({ from, to }, zone);
        timeRange.onTimeRangeChange(range);
      }

      if (Object.keys(rest).length > 0) {
        timeRange.setState({ ...rest });
      }
    };
    message.on('grafana:action:scene:time-range:state', timeRangeHandler);

    // 修改 TimePicker
    const timePickerHandler = (payload?: Record<string, any>) => {
      const { ...rest } = payload || {};

      if (Object.keys(rest).length > 0) {
        timePicker?.setState({ ...rest });
      }
    };
    message.on('grafana:action:scene:time-picker:state', timePickerHandler);

    // 修改 RefreshPicker
    const refreshPickerHandler = (payload?: { refresh?: string; autoEnabled?: boolean } & Record<string, any>) => {
      const { refresh, autoEnabled, ...rest } = payload || {};

      if (refresh !== undefined) {
        refreshPicker?.onIntervalChanged(refresh);
      }

      if (Object.keys(rest).length > 0) {
        refreshPicker?.setState({ ...rest });
      }
    };
    message.on('grafana:action:scene:refresh-picker:state', refreshPickerHandler);

    // #endregion

    // #region 触发刷新

    // 触发 TimeRange 刷新
    const timeRangeRefreshHandler = () => {
      timeRange.onRefresh();
    };
    message.on('grafana:action:scene:time-range:refresh', timeRangeRefreshHandler);

    // 触发 RefreshPicker 刷新
    const refreshPickerRefreshHandler = () => {
      refreshPicker?.onRefresh();
    };
    message.on('grafana:action:scene:refresh-picker:refresh', refreshPickerRefreshHandler);

    // #endregion

    return () => {
      // 取消订阅
      timeRangeSub.unsubscribe();
      timePickerSub?.unsubscribe();
      refreshPickerSub?.unsubscribe();

      // 恢复原始方法
      timeRange.onRefresh = timeRangeOnRefresh;
      if (refreshPicker && refreshPickerOnRefresh) {
        refreshPicker.onRefresh = refreshPickerOnRefresh;
      }

      // 下线通知
      message.sendMessage('grafana:event:scene:offline', { instanceId });

      // 移除监听
      message.off('grafana:action:scene:time-range:state', timeRangeHandler);
      message.off('grafana:action:scene:time-picker:state', timePickerHandler);
      message.off('grafana:action:scene:refresh-picker:state', refreshPickerHandler);
      message.off('grafana:action:scene:time-range:refresh', timeRangeRefreshHandler);
      message.off('grafana:action:scene:refresh-picker:refresh', refreshPickerRefreshHandler);

      // 销毁实例
      message.destroy();
    };
  }
}
