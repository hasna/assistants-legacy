import React from 'react';
import { Inline } from '../../ui/ink';
import { color } from './color';

export type Status = 'success' | 'error' | 'warning' | 'info' | 'pending' | 'loading';

interface StatusIconProps {
  status: Status;
  /** Append a trailing space (useful before a label). Default: false. */
  withSpace?: boolean;
}

/** Icon + semantic-color mapping for each status. */
export const STATUS_CONFIG: Record<Status, { icon: string; token: string }> = {
  success: { icon: '✓', token: 'success' },
  error: { icon: '✗', token: 'error' },
  warning: { icon: '⚠', token: 'warning' },
  info: { icon: 'ℹ', token: 'info' },
  pending: { icon: '○', token: 'muted' },
  loading: { icon: '…', token: 'muted' },
};

/**
 * An inline status glyph colored by semantic meaning.
 *
 * @example
 * <Text><StatusIcon status="success" withSpace />Done</Text>
 */
export function StatusIcon({ status, withSpace = false }: StatusIconProps) {
  const cfg = STATUS_CONFIG[status];
  return <Inline fg={color(cfg.token)}>{cfg.icon}{withSpace ? ' ' : ''}</Inline>;
}
