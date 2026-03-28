import React, { useEffect, useState } from 'react';
import type { ProjectRecord } from '@hasna/assistants-core';
import { useSafeInput as useInput } from '../hooks/useSafeInput';

interface ProjectsPanelProps {
  projects: ProjectRecord[];
  activeProjectId?: string;
  onSelect: (projectId: string) => void;
  onCreate: (name: string, description?: string) => Promise<void>;
  onDelete: (projectId: string) => Promise<void>;
  onViewPlans: (projectId: string) => void;
  onCancel: () => void;
}

/**
 * Format date for project display
 */
function formatProjectTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).toLowerCase();
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }).toLowerCase();
}

type Mode = 'list' | 'create' | 'delete-confirm';

export function ProjectsPanel({
  projects,
  activeProjectId,
  onSelect,
  onCreate,
  onDelete,
  onViewPlans,
  onCancel,
}: ProjectsPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [createStep, setCreateStep] = useState<'name' | 'description'>('name');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, projects.length));
  }, [projects.length]);

  useEffect(() => {
    if (mode === 'delete-confirm' && (!projects[selectedIndex] || projects.length === 0)) {
      setMode('list');
    }
  }, [mode, projects, selectedIndex]);

  useInput((input, key) => {
    // In create mode, handle text input
    if (mode === 'create') {
      if (key.escape) {
        setMode('list');
        setNewName('');
        setNewDescription('');
        setCreateStep('name');
        return;
      }
      // Text input handled by TextInput component
      return;
    }

    // In delete confirmation mode
    if (mode === 'delete-confirm') {
      if (input === 'y' || input === 'Y') {
        const project = projects[selectedIndex];
        if (project) {
          setIsSubmitting(true);
          onDelete(project.id).finally(() => {
            setIsSubmitting(false);
            setMode('list');
          });
        }
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setMode('list');
        return;
      }
      return;
    }

    // List mode shortcuts
    if (input === 'n' || input === 'N') {
      setMode('create');
      setCreateStep('name');
      return;
    }

    if (input === 'd' || input === 'D') {
      if (projects.length > 0 && selectedIndex < projects.length) {
        setMode('delete-confirm');
      }
      return;
    }

    if (input === 'p' || input === 'P') {
      if (projects.length > 0 && selectedIndex < projects.length) {
        onViewPlans(projects[selectedIndex].id);
      }
      return;
    }

    // Escape or q: cancel
    if (key.escape || input === 'q' || input === 'Q') {
      onCancel();
      return;
    }

    // Enter: select/view project
    if (key.return) {
      if (selectedIndex === projects.length) {
        // "New project" option
        setMode('create');
        setCreateStep('name');
      } else {
        onSelect(projects[selectedIndex].id);
      }
      return;
    }

    // Arrow navigation with wraparound
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev === 0 ? projects.length : prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => (prev === projects.length ? 0 : prev + 1));
      return;
    }

    // Number keys for quick selection (1-9)
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= projects.length) {
      setSelectedIndex(num - 1);
      return;
    }
  }, { isActive: mode === 'list' || mode === 'delete-confirm' });

  const handleNameSubmit = () => {
    if (!newName.trim()) return;
    setCreateStep('description');
  };

  const handleDescriptionSubmit = async () => {
    if (!newName.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreate(newName.trim(), newDescription.trim() || undefined);
      setNewName('');
      setNewDescription('');
      setCreateStep('name');
      setMode('list');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipDescription = async () => {
    if (!newName.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreate(newName.trim());
      setNewName('');
      setNewDescription('');
      setCreateStep('name');
      setMode('list');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create mode UI
  if (mode === 'create') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="cyan"><b>Create New Project</b></text>
        </box>

        {createStep === 'name' && (
          <box flexDirection="column">
            <box>
              <text>Name: </text>
              <input
                value={newName}
                onChange={setNewName}
                onSubmit={handleNameSubmit}
                focused
                placeholder="Enter project name..."
              />
            </box>
            <box marginTop={1}>
              <text fg="gray">Enter to continue | Esc to cancel</text>
            </box>
          </box>
        )}

        {createStep === 'description' && (
          <box flexDirection="column">
            <box>
              <text fg="gray">Name: </text>
              <text>{newName}</text>
            </box>
            <box marginTop={1}>
              <text>Description: </text>
              <input
                value={newDescription}
                onChange={setNewDescription}
                onSubmit={handleDescriptionSubmit}
                focused
                placeholder="Enter description (optional)..."
              />
            </box>
            <box marginTop={1}>
              <text fg="gray">Enter to create | Tab to skip | Esc to cancel</text>
            </box>
          </box>
        )}

        {isSubmitting && (
          <box marginTop={1}>
            <text fg="yellow">Creating project...</text>
          </box>
        )}
      </box>
    );
  }

  // Delete confirmation mode
  if (mode === 'delete-confirm') {
    const project = projects[selectedIndex];
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg="red"><b>Delete Project</b></text>
        </box>
        <box marginBottom={1}>
          <text>
            Are you sure you want to delete &quot;{project?.name}&quot;?
          </text>
        </box>
        <box>
          <text fg="gray">This will delete all plans in this project.</text>
        </box>
        <box marginTop={1}>
          <text>
            Press <text fg="green"><b>y</b></text> to confirm or{' '}
            <text fg="red"><b>n</b></text> to cancel
          </text>
        </box>
      </box>
    );
  }

  // List mode UI
  return (
    <box flexDirection="column" paddingY={1}>
      <box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <text><b>Projects</b></text>
        <text fg="gray">[n]ew</text>
      </box>

      <box
        flexDirection="column"
        borderStyle="rounded"
        borderColor="#d4d4d8" border={["top", "bottom"]}
        paddingX={1}
      >
        {projects.length === 0 ? (
          <box paddingY={1}>
            <text fg="gray">No projects yet. Press n to create one.</text>
          </box>
        ) : (
          projects.map((project, index) => {
            const isActive = project.id === activeProjectId;
            const isSelected = index === selectedIndex;
            const planCount = project.plans.length;
            const contextCount = project.context.length;
            const time = formatProjectTime(project.updatedAt);

            return (
              <box key={project.id} paddingY={0}>
                <text
                  bg={isSelected ? "#0055aa" : undefined}
                  fg={isSelected ? "whiteBright" : undefined}
                >
                  {isActive ? '*' : ' '} {index + 1}. {project.name.padEnd(20)} {planCount} plan{planCount !== 1 ? 's' : ''} {contextCount > 0 ? `${contextCount} ctx` : ''} {time}
                </text>
              </box>
            );
          })
        )}

        {/* New project option */}
        <box marginTop={1} paddingY={0}>
          <text
            bg={selectedIndex === projects.length ? "#0055aa" : undefined}
            fg={selectedIndex === projects.length ? "whiteBright" : undefined}
          >
            + New project (n)
          </text>
        </box>
      </box>

      {/* Selected project details */}
      {projects.length > 0 && selectedIndex < projects.length && (
        <box marginTop={1} flexDirection="column">
          <text fg="gray">
            {projects[selectedIndex].description || 'No description'}
          </text>
        </box>
      )}

      <box marginTop={1}>
        <text fg="gray">
          Enter select | p plans | d delete | Esc close | 1-{Math.max(1, projects.length)} jump
        </text>
      </box>
    </box>
  );
}
