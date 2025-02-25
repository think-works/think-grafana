import { cx } from '@emotion/css';
import React, { ReactElement, useCallback } from 'react';

import { selectors } from '@grafana/e2e-selectors';

import { isEmbedded } from '../../../../../think/packages/detection';
import { Dropdown } from '../Dropdown/Dropdown';
import { ToolbarButton } from '../ToolbarButton';
import { TooltipPlacement } from '../Tooltip';

interface PanelMenuProps {
  menu: ReactElement | (() => ReactElement);
  menuButtonClass?: string;
  dragClassCancel?: string;
  title?: string;
  placement?: TooltipPlacement;
  offset?: [number, number];
  onVisibleChange?: (state: boolean) => void;
  onOpenMenu?: () => void;
}

export function PanelMenu({
  menu,
  title,
  placement = 'bottom',
  offset,
  dragClassCancel,
  menuButtonClass,
  onVisibleChange,
  onOpenMenu,
}: PanelMenuProps) {
  const testId = title ? selectors.components.Panels.Panel.menu(title) : `panel-menu-button`;

  const handleVisibility = useCallback(
    (show: boolean) => {
      if (show && onOpenMenu) {
        onOpenMenu();
      }
      return onVisibleChange;
    },
    [onOpenMenu, onVisibleChange]
  );

  if (isEmbedded()) {
    return null;
  }

  return (
    <Dropdown overlay={menu} placement={placement} offset={offset} onVisibleChange={handleVisibility}>
      <ToolbarButton
        aria-label={`Menu for panel with ${title ? `title ${title}` : 'no title'}`}
        title="Menu"
        icon="ellipsis-v"
        iconSize="md"
        narrow
        data-testid={testId}
        className={cx(menuButtonClass, dragClassCancel)}
      />
    </Dropdown>
  );
}
