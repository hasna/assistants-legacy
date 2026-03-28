import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Job, JobManager, JobStatus } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

interface JobsPanelProps {
  manager: JobManager;
  onClose: () => void;
}

type ViewMode = 'list' | 'detail';
type FilterTab = 'all' | 'active' | 'done';

const FILTER_TABS: FilterTab[] = ['all', 'active', 'done'];
const MAX_VISIBLE_ROWS = 12;

function isActiveStatus(status: JobStatus): boolean {
  return status === 'pending' || status === 'running';
}

function isDoneStatus(status: JobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'timeout' || status === 'cancelled';
}

function statusColor(status: JobStatus): string {
  switch (status) {
    case 'pending':
      return 'yellow';
    case 'running':
      return 'cyan';
    case 'completed':
      return 'green';
    case 'failed':
      return 'red';
    case 'timeout':
      return 'magenta';
    case 'cancelled':
      return 'gray';
    default:
      return 'white';
  }
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.max(0, Math.floor(diff / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatDuration(job: Job): string {
  const start = job.startedAt || job.createdAt;
  const end = job.completedAt || Date.now();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function fit(value: string, width: number, align: 'left' | 'right' = 'left'): string {
  const text = value || '';
  if (text.length > width) {
    return width > 3 ? `${text.slice(0, width - 3)}...` : text.slice(0, width);
  }
  return align === 'right' ? text.padStart(width, ' ') : text.padEnd(width, ' ');
}

function truncateText(value: string, maxLength: number): string {
  if (!value) return '';
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value;
}

function visibleWindow(selectedIndex: number, total: number): { start: number; end: number; above: number; below: number } {
  if (total <= MAX_VISIBLE_ROWS) {
    return { start: 0, end: total, above: 0, below: 0 };
  }

  const half = Math.floor(MAX_VISIBLE_ROWS / 2);
  let start = selectedIndex - half;
  let end = start + MAX_VISIBLE_ROWS;

  if (start < 0) {
    start = 0;
    end = MAX_VISIBLE_ROWS;
  }

  if (end > total) {
    end = total;
    start = Math.max(0, end - MAX_VISIBLE_ROWS);
  }

  return {
    start,
    end,
    above: start,
    below: total - end,
  };
}

function statusBadge(status: JobStatus): string {
  switch (status) {
    case 'pending':
      return 'PENDING';
    case 'running':
      return 'RUNNING';
    case 'completed':
      return 'DONE';
    case 'failed':
      return 'FAILED';
    case 'timeout':
      return 'TIMEOUT';
    case 'cancelled':
      return 'CANCELLED';
  }
  return 'UNKNOWN';
}

export function JobsPanel({ manager, onClose }: JobsPanelProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<ViewMode>('list');
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [filterIndex, setFilterIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refreshJobs = useCallback(async (notify = false) => {
    try {
      const data = await manager.listSessionJobs();
      const sorted = [...data].sort((a, b) => {
        const aActive = isActiveStatus(a.status) ? 0 : 1;
        const bActive = isActiveStatus(b.status) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return b.createdAt - a.createdAt;
      });
      setJobs(sorted);
      setError(null);
      if (notify) setStatusMessage('Refreshed jobs.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [manager]);

  useEffect(() => {
    void refreshJobs(false);
  }, [refreshJobs]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 2200);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const activeFilter = FILTER_TABS[filterIndex] || 'all';

  const filteredJobs = useMemo(() => {
    if (activeFilter === 'all') return jobs;
    if (activeFilter === 'active') return jobs.filter((job) => isActiveStatus(job.status));
    return jobs.filter((job) => isDoneStatus(job.status));
  }, [activeFilter, jobs]);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, filteredJobs.length - 1)));
  }, [filteredJobs.length]);

  const detailJob = useMemo(() => {
    if (!detailJobId) return null;
    return jobs.find((job) => job.id === detailJobId) ?? null;
  }, [jobs, detailJobId]);

  useEffect(() => {
    if (mode === 'detail' && !detailJob) {
      setMode('list');
      setDetailJobId(null);
    }
  }, [mode, detailJob]);

  const cancelJob = useCallback(async (job: Job | null) => {
    if (!job || isWorking) return;
    if (!isActiveStatus(job.status)) {
      setStatusMessage(`Job ${job.id} is ${job.status}. Only pending/running jobs can be killed.`);
      return;
    }
    setIsWorking(true);
    try {
      const cancelled = await manager.cancelJob(job.id);
      if (cancelled) {
        setStatusMessage(`Killed ${job.id}.`);
      } else {
        setStatusMessage(`Could not kill ${job.id}.`);
      }
      await refreshJobs(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsWorking(false);
    }
  }, [isWorking, manager, refreshJobs]);

  const killAllActiveJobs = useCallback(async () => {
    if (isWorking) return;
    const activeJobs = jobs.filter((job) => isActiveStatus(job.status));
    if (activeJobs.length === 0) {
      setStatusMessage('No active jobs to kill.');
      return;
    }

    setIsWorking(true);
    try {
      let killed = 0;
      for (const job of activeJobs) {
        try {
          const cancelled = await manager.cancelJob(job.id);
          if (cancelled) killed += 1;
        } catch {
          // Continue cancelling the rest even if one cancellation fails.
        }
      }

      if (killed === 0) {
        setStatusMessage('Could not kill any active jobs.');
      } else if (killed === activeJobs.length) {
        setStatusMessage(`Killed ${killed} active job${killed === 1 ? '' : 's'}.`);
      } else {
        setStatusMessage(`Killed ${killed}/${activeJobs.length} active jobs.`);
      }
      await refreshJobs(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsWorking(false);
    }
  }, [isWorking, jobs, manager, refreshJobs]);

  const openDetail = useCallback(() => {
    const selected = filteredJobs[selectedIndex];
    if (!selected) return;
    setDetailJobId(selected.id);
    setMode('detail');
  }, [filteredJobs, selectedIndex]);

  useInput((input, key) => {
    if (mode === 'detail') {
      if (input === 'q') {
        onClose();
        return;
      }
      if (key.escape || key.backspace) {
        setMode('list');
        setDetailJobId(null);
        return;
      }
      if (input === 'r') {
        void refreshJobs(true);
        return;
      }
      if (input === 'K') {
        void killAllActiveJobs();
        return;
      }
      if (input === 'x' || input === 'c' || input === 'd') {
        void cancelJob(detailJob);
      }
      return;
    }

    if (input === 'q' || key.escape) {
      onClose();
      return;
    }

    if (input === '1') {
      setFilterIndex(0);
      setSelectedIndex(0);
      return;
    }
    if (input === '2') {
      setFilterIndex(1);
      setSelectedIndex(0);
      return;
    }
    if (input === '3') {
      setFilterIndex(2);
      setSelectedIndex(0);
      return;
    }

    if (key.leftArrow) {
      setFilterIndex((prev) => (prev === 0 ? FILTER_TABS.length - 1 : prev - 1));
      setSelectedIndex(0);
      return;
    }
    if (key.rightArrow) {
      setFilterIndex((prev) => (prev === FILTER_TABS.length - 1 ? 0 : prev + 1));
      setSelectedIndex(0);
      return;
    }

    if (key.upArrow || input === 'k') {
      if (filteredJobs.length === 0) return;
      setSelectedIndex((prev) => (prev === 0 ? filteredJobs.length - 1 : prev - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      if (filteredJobs.length === 0) return;
      setSelectedIndex((prev) => (prev >= filteredJobs.length - 1 ? 0 : prev + 1));
      return;
    }

    if (key.return) {
      openDetail();
      return;
    }

    if (input === 'r') {
      void refreshJobs(true);
      return;
    }

    if (input === 'K') {
      void killAllActiveJobs();
      return;
    }

    if (input === 'x' || input === 'c' || input === 'd') {
      void cancelJob(filteredJobs[selectedIndex] || null);
    }
  });

  if (isLoading) {
    return (
      <box flexDirection="column">
        <text><b>Jobs</b></text>
        <text fg="gray">Loading jobs...</text>
      </box>
    );
  }

  const tabLabel = (
    <box marginBottom={1}>
      <text>{FILTER_TABS.map((tab, index) => {
        const label = `${index + 1}:${tab}`;
        return <span key={tab} fg={index === filterIndex ? 'cyan' : 'gray'}>{label}{'  '}</span>;
      })}<span fg="gray">{`(${jobs.length} total, ${jobs.filter((job) => isActiveStatus(job.status)).length} active)`}</span></text>
    </box>
  );

  if (mode === 'detail' && detailJob) {
    const resultPreview = detailJob.result?.content ? truncateText(detailJob.result.content, 900) : null;
    const errorPreview = detailJob.error?.message ? truncateText(detailJob.error.message, 300) : null;
    return (
      <box flexDirection="column">
        <text><b>Job Detail</b></text>
        <box marginTop={1}>
          <text>ID: {detailJob.id}</text>
        </box>
        <text>
          {'Status: '}<span fg={statusColor(detailJob.status)}>{statusBadge(detailJob.status)}</span>
        </text>
        <text>Connector: {detailJob.connectorName}</text>
        <text>Command: {detailJob.command}</text>
        <text>Session: {detailJob.sessionId}</text>
        <text>Created: {new Date(detailJob.createdAt).toLocaleString()}</text>
        <text>Started: {detailJob.startedAt ? new Date(detailJob.startedAt).toLocaleString() : '-'}</text>
        <text>Completed: {detailJob.completedAt ? new Date(detailJob.completedAt).toLocaleString() : '-'}</text>
        <text>{`Timeout: ${Math.round(detailJob.timeoutMs / 1000)}s`}</text>
        <text>Duration: {formatDuration(detailJob)}</text>
        {resultPreview && (
          <box marginTop={1} flexDirection="column">
            <text fg="green">Result:</text>
            <text>{resultPreview}</text>
          </box>
        )}
        {errorPreview && (
          <box marginTop={1} flexDirection="column">
            <text fg="red">Error:</text>
            <text>{errorPreview}</text>
          </box>
        )}
        {error && (
          <text fg="red">{error}</text>
        )}
        {statusMessage && (
          <text fg="cyan">{statusMessage}</text>
        )}
        <box marginTop={1}>
          <text fg="gray">d/x/c kill selected  K kill all active  r refresh  esc back  q close</text>
        </box>
      </box>
    );
  }

  const windowed = visibleWindow(selectedIndex, filteredJobs.length);
  const visibleRows = filteredJobs.slice(windowed.start, windowed.end);

  return (
    <box flexDirection="column">
      <text><b>Jobs</b></text>
      {tabLabel}

      <text fg="gray">{fit('Status', 10)} {fit('ID', 16)} {fit('Connector', 14)} {fit('Age', 6, 'right')} {fit('Run', 6, 'right')} Command</text>
      <text fg="gray">{'-'.repeat(86)}</text>

      {filteredJobs.length === 0 && (
        <text fg="gray">
          {activeFilter === 'all' ? 'No jobs in this session.' : activeFilter === 'active' ? 'No active jobs.' : 'No completed/failed jobs.'}
        </text>
      )}

      {windowed.above > 0 && (
        <text fg="gray">{`... ${windowed.above} above ...`}</text>
      )}
      {visibleRows.map((job, idx) => {
        const absolute = windowed.start + idx;
        const selected = absolute === selectedIndex;
        return (
          <box key={job.id}>
            <text><span fg={selected ? 'cyan' : 'gray'}>{selected ? '>' : ' '}</span>{' '}<span fg={statusColor(job.status)}>{fit(statusBadge(job.status), 10)}</span>{' '}{fit(job.id, 16)}{' '}{fit(job.connectorName, 14)}{' '}{fit(formatRelativeTime(job.createdAt), 6, 'right')}{' '}{fit(formatDuration(job), 6, 'right')}{' '}{truncateText(job.command, 28)}</text>
          </box>
        );
      })}
      {windowed.below > 0 && (
        <text fg="gray">{`... ${windowed.below} below ...`}</text>
      )}

      {error && (
        <text fg="red">{error}</text>
      )}
      {statusMessage && (
        <text fg="cyan">{statusMessage}</text>
      )}
      {isWorking && (
        <text fg="yellow">Applying action...</text>
      )}

      <box marginTop={1}>
        <text fg="gray">j/k or arrows move  enter view  d/x/c kill selected  K kill all active  r refresh  1/2/3 filter  q close</text>
      </box>
    </box>
  );
}
