import React from 'react';
import { themeColor } from '../theme/colors';

interface ParsedError {
  code?: string;
  message: string;
  suggestion?: string;
}

function parseErrorMessage(error: string): ParsedError {
  const lines = error.split('\n');
  const suggestionLine = lines.find((line) => line.toLowerCase().startsWith('suggestion:'));
  const suggestion = suggestionLine ? suggestionLine.replace(/^suggestion:\s*/i, '').trim() : undefined;
  const mainLines = suggestionLine ? lines.filter((line) => line !== suggestionLine) : lines;
  let message = mainLines.join('\n').trim();
  let code: string | undefined;
  const index = message.indexOf(':');
  if (index > 0) {
    const candidate = message.slice(0, index).trim();
    if (/^[A-Z0-9_]+$/.test(candidate)) {
      code = candidate;
      message = message.slice(index + 1).trim();
    }
  }
  return { code, message, suggestion };
}

interface ErrorBannerProps {
  error: string;
  showErrorCodes?: boolean;
}

export function ErrorBanner({ error, showErrorCodes = false }: ErrorBannerProps) {
  const parsed = parseErrorMessage(error);
  const severity = parsed.code && /TIMEOUT|RATE_LIMITED/.test(parsed.code) ? themeColor('yellow') : themeColor('red');
  const prefix = showErrorCodes && parsed.code ? `${parsed.code}: ` : '';

  return (
    <box marginY={1} flexDirection="column">
      <text fg={severity}>{prefix}{parsed.message}</text>
      {parsed.suggestion && (
        <text fg={severity}>Suggestion: {parsed.suggestion}</text>
      )}
    </box>
  );
}
