import React, { Component } from 'react';
import { Unsubscribable } from 'rxjs';

import { dateMath, TimeRange, TimeZone } from '@grafana/data';
import { TimeRangeUpdatedEvent } from '@grafana/runtime';
import { defaultIntervals, RefreshPicker } from '@grafana/ui';
import { TimePickerWithHistory } from 'app/core/components/TimePicker/TimePickerWithHistory';
import { appEvents } from 'app/core/core';
import { t } from 'app/core/internationalization';
import { getTimeSrv } from 'app/features/dashboard/services/TimeSrv';

import { THINK_APP_ID, ThinkGrafanaMessage } from '../../../../../../think/message';
import { ShiftTimeEvent, ShiftTimeEventDirection, ZoomOutEvent } from '../../../../types/events';
import { DashboardModel } from '../../state';

export interface Props {
  dashboard: DashboardModel;
  onChangeTimeZone: (timeZone: TimeZone) => void;
  isOnCanvas?: boolean;
  reverseOverlay?: boolean;
}

export class DashNavTimeControls extends Component<Props> {
  private sub?: Unsubscribable;
  private message?: ThinkGrafanaMessage;

  componentDidMount() {
    this.sub = this.props.dashboard.events.subscribe(TimeRangeUpdatedEvent, () => this.forceUpdate());
    this.initMessage();
  }

  componentWillUnmount() {
    this.sub?.unsubscribe();
    this.destroyMessage();
  }

  initMessage = () => {
    this.message = new ThinkGrafanaMessage({
      targetId: THINK_APP_ID,
    });
    this.message.on('trigger:time-refresh', () => {
      this.onRefresh(null, true);
    });
    this.message.on('trigger:time-refresh-interval', (interval: string) => {
      this.onChangeRefreshInterval(interval, true);
    });
    this.message.on('trigger:time-range-picker', (timeRange: TimeRange) => {
      const { from, to } = timeRange || {};
      const nextRange: TimeRange = {
        from: typeof from === 'number' ? dateMath.parse(new Date(from))! : from,
        to: typeof to === 'number' ? dateMath.parse(new Date(to))! : to,
        raw: {
          from,
          to,
        },
      };
      this.onChangeTimePicker(nextRange, true);
    });
  };

  destroyMessage = () => {
    this.message?.destroy();
  };

  onChangeRefreshInterval = (interval: string, ignoreMessage = false) => {
    getTimeSrv().setAutoRefresh(interval);
    this.forceUpdate();

    if (!ignoreMessage) {
      this.message?.sendMessage('event:time-refresh-interval', interval);
    }
  };

  onRefresh = (e?: unknown, ignoreMessage = false) => {
    getTimeSrv().refreshTimeModel();

    if (!ignoreMessage) {
      this.message?.sendMessage('event:time-refresh', null);
    }

    return Promise.resolve();
  };

  onMoveBack = () => {
    appEvents.publish(new ShiftTimeEvent({ direction: ShiftTimeEventDirection.Left }));
  };

  onMoveForward = () => {
    appEvents.publish(new ShiftTimeEvent({ direction: ShiftTimeEventDirection.Right }));
  };

  onChangeTimePicker = (timeRange: TimeRange, ignoreMessage = false) => {
    const { dashboard } = this.props;
    const panel = dashboard.timepicker;
    const hasDelay = panel.nowDelay && timeRange.raw.to === 'now';

    const adjustedFrom = dateMath.isMathString(timeRange.raw.from) ? timeRange.raw.from : timeRange.from;
    const adjustedTo = dateMath.isMathString(timeRange.raw.to) ? timeRange.raw.to : timeRange.to;
    const nextRange = {
      from: adjustedFrom,
      to: hasDelay ? 'now-' + panel.nowDelay : adjustedTo,
    };

    getTimeSrv().setTime(nextRange);

    const { from, to } = nextRange || {};
    if (!ignoreMessage) {
      this.message?.sendMessage('event:time-range-picker', {
        from: from?.valueOf(),
        to: to?.valueOf(),
      });
    }
  };

  onChangeTimeZone = (timeZone: TimeZone) => {
    this.props.dashboard.timezone = timeZone;
    this.props.onChangeTimeZone(timeZone);
    this.onRefresh();
  };

  onChangeFiscalYearStartMonth = (month: number) => {
    this.props.dashboard.fiscalYearStartMonth = month;
    this.onRefresh();
  };

  onZoom = () => {
    appEvents.publish(new ZoomOutEvent({ scale: 2 }));
  };

  render() {
    const { dashboard, isOnCanvas, reverseOverlay } = this.props;
    const { refresh_intervals } = dashboard.timepicker;
    const intervals = getTimeSrv().getValidIntervals(refresh_intervals || defaultIntervals);

    const timePickerValue = getTimeSrv().timeRange();
    const timeZone = dashboard.getTimezone();
    const fiscalYearStartMonth = dashboard.fiscalYearStartMonth;
    const hideIntervalPicker = dashboard.panelInEdit?.isEditing;

    return (
      <>
        <TimePickerWithHistory
          value={timePickerValue}
          onChange={this.onChangeTimePicker}
          timeZone={timeZone}
          fiscalYearStartMonth={fiscalYearStartMonth}
          onMoveBackward={this.onMoveBack}
          onMoveForward={this.onMoveForward}
          onZoom={this.onZoom}
          onChangeTimeZone={this.onChangeTimeZone}
          onChangeFiscalYearStartMonth={this.onChangeFiscalYearStartMonth}
          isOnCanvas={isOnCanvas}
          reverseOverlay={reverseOverlay}
        />
        <RefreshPicker
          onIntervalChanged={this.onChangeRefreshInterval}
          onRefresh={this.onRefresh}
          value={dashboard.refresh}
          intervals={intervals}
          isOnCanvas={isOnCanvas}
          tooltip={t('dashboard.toolbar.refresh', 'Refresh dashboard')}
          noIntervalPicker={hideIntervalPicker}
          reverseOverlay={reverseOverlay}
        />
      </>
    );
  }
}
