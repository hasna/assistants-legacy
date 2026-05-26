import React, { useState, useEffect } from 'react';
import { useClearOnChange } from '../hooks/useClearOnChange';
import type { Skill } from '@hasna/assistants-shared';
import { useSafeInput as useInput } from '../hooks/useSafeInput';
import type { CreateSkillOptions, CreateSkillResult, SkillScope } from '@hasna/assistants-core';
import { themeColor } from '../theme/colors';

interface SkillsPanelProps {
  skills: Skill[];
  onExecute: (name: string) => void;
  onCreate: (options: CreateSkillOptions) => Promise<CreateSkillResult>;
  onGenerateDraft?: (prompt: string, scope: SkillScope) => Promise<SkillDraft>;
  onDelete: (name: string, filePath: string) => Promise<void>;
  onRefresh: () => Promise<Skill[]>;
  onEnsureContent: (name: string) => Promise<Skill | null>;
  onClose: () => void;
  cwd: string;
}

type Mode = 'list' | 'detail' | 'delete-confirm' | 'create';
type CreateStep = 'scope' | 'prompt' | 'name' | 'description' | 'tools' | 'hint' | 'content' | 'confirm';
type CreateMode = 'manual' | 'prompt';

type SkillDraft = {
  name?: string;
  description?: string;
  allowedTools?: string[];
  argumentHint?: string;
  content?: string;
};

const SCOPE_OPTIONS: { id: SkillScope; label: string; desc: string }[] = [
  { id: 'project', label: 'Project', desc: 'Local to this project (.skill/)' },
  { id: 'global', label: 'Global', desc: 'Available everywhere (~/.skill/)' },
];

const MAX_VISIBLE_SKILLS = 10;

function getVisibleRange(
  selectedIndex: number,
  totalItems: number,
  maxVisible: number = MAX_VISIBLE_SKILLS
): { start: number; end: number; hasMore: { above: number; below: number } } {
  if (totalItems <= maxVisible) {
    return {
      start: 0,
      end: totalItems,
      hasMore: { above: 0, below: 0 },
    };
  }

  const halfWindow = Math.floor(maxVisible / 2);
  let start = selectedIndex - halfWindow;
  let end = selectedIndex + (maxVisible - halfWindow);

  if (start < 0) {
    start = 0;
    end = maxVisible;
  }

  if (end > totalItems) {
    end = totalItems;
    start = Math.max(0, totalItems - maxVisible);
  }

  return {
    start,
    end,
    hasMore: {
      above: start,
      below: totalItems - end,
    },
  };
}

function getSkillScope(filePath: string): 'global' | 'project' {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const globalPrefix = `${home}/.skill/`;
  if (filePath.startsWith(globalPrefix) || filePath.includes('/.skill/') && filePath.includes(home)) {
    return 'global';
  }
  return 'project';
}

export function SkillsPanel({
  skills: initialSkills,
  onExecute,
  onCreate,
  onGenerateDraft,
  onDelete,
  onRefresh,
  onEnsureContent,
  onClose,
  cwd,
}: SkillsPanelProps) {
  const [skills, setSkills] = useState(initialSkills);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  useClearOnChange(mode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null);

  // Create flow state
  const [createMode, setCreateMode] = useState<CreateMode>('manual');
  const [createStep, setCreateStep] = useState<CreateStep>('scope');
  const [createScopeIndex, setCreateScopeIndex] = useState(0);
  const [createPrompt, setCreatePrompt] = useState('');
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createTools, setCreateTools] = useState('');
  const [createHint, setCreateHint] = useState('');
  const [createContent, setCreateContent] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Group skills by scope
  const projectSkills = skills.filter(s => getSkillScope(s.filePath) === 'project');
  const globalSkills = skills.filter(s => getSkillScope(s.filePath) === 'global');
  const sortedSkills = [...projectSkills, ...globalSkills];
  const totalItems = sortedSkills.length + 1; // +1 for "New skill" action

  useEffect(() => {
    setSkills(initialSkills);
  }, [initialSkills]);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, totalItems - 1)));
  }, [totalItems]);

  const selectedSkill = selectedIndex < sortedSkills.length ? sortedSkills[selectedIndex] : undefined;

  useEffect(() => {
    if (mode === 'detail' && !detailSkill) {
      setMode('list');
    }
  }, [mode, detailSkill]);

  useEffect(() => {
    if (mode === 'delete-confirm' && !selectedSkill) {
      setMode('list');
    }
  }, [mode, selectedSkill]);

  function resetCreateState() {
    setCreateMode('manual');
    setCreateStep('scope');
    setCreateScopeIndex(0);
    setCreatePrompt('');
    setCreateName('');
    setCreateDescription('');
    setCreateTools('');
    setCreateHint('');
    setCreateContent('');
    setCreateError(null);
  }

  function normalizeDraftName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return '';
    const withoutPrefix = trimmed.replace(/^skill[-\s]*/i, '').replace(/\bskill\b/gi, '').trim();
    return withoutPrefix || trimmed;
  }

  async function handlePromptSubmit() {
    const prompt = createPrompt.trim();
    if (!prompt) {
      setCreateError('Prompt is required');
      return;
    }
    if (!onGenerateDraft) {
      setCreateError('Skill generation is not available.');
      return;
    }

    setIsSubmitting(true);
    setCreateError(null);
    try {
      const scope = SCOPE_OPTIONS[createScopeIndex].id;
      const draft = await onGenerateDraft(prompt, scope);
      const normalizedName = draft.name ? normalizeDraftName(draft.name) : '';
      if (normalizedName) setCreateName(normalizedName);
      if (draft.description) setCreateDescription(draft.description);
      if (draft.allowedTools && draft.allowedTools.length > 0) {
        setCreateTools(draft.allowedTools.join(', '));
      }
      if (draft.argumentHint) setCreateHint(draft.argumentHint);
      if (draft.content) setCreateContent(draft.content);
      if (!normalizedName) {
        setCreateError('Draft missing name. Please enter one.');
        setCreateStep('name');
        return;
      }
      setCreateStep('confirm');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateSubmit() {
    const scope = SCOPE_OPTIONS[createScopeIndex].id;
    const name = createName.trim();
    if (!name) {
      setCreateError('Name is required');
      setCreateStep('name');
      return;
    }

    const tools = createTools.trim()
      ? createTools.split(',').map(t => t.trim()).filter(Boolean)
      : undefined;

    setIsSubmitting(true);
    setCreateError(null);
    try {
      await onCreate({
        name,
        scope,
        description: createDescription.trim() || undefined,
        allowedTools: tools,
        argumentHint: createHint.trim() || undefined,
        content: createContent.trim() || undefined,
        cwd,
      });
      const refreshed = await onRefresh();
      setSkills(refreshed);
      resetCreateState();
      setMode('list');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Create mode input - non-text steps
  useInput((input, key) => {
    if (mode !== 'create') return;

    // Steps that use TextInput handle their own input
    if (['prompt', 'name', 'description', 'tools', 'hint', 'content'].includes(createStep)) return;

    if (key.escape) {
      if (createStep === 'scope') {
        resetCreateState();
        setMode('list');
      } else {
        const stepOrder: CreateStep[] = createMode === 'prompt'
          ? ['scope', 'prompt', 'name', 'description', 'tools', 'hint', 'content', 'confirm']
          : ['scope', 'name', 'description', 'tools', 'hint', 'content', 'confirm'];
        const currentIdx = stepOrder.indexOf(createStep);
        if (currentIdx > 0) {
          setCreateStep(stepOrder[currentIdx - 1]);
        } else {
          resetCreateState();
          setMode('list');
        }
      }
      return;
    }

    // Scope selection
    if (createStep === 'scope') {
      if (key.upArrow) {
        setCreateScopeIndex((prev) => (prev === 0 ? SCOPE_OPTIONS.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setCreateScopeIndex((prev) => (prev === SCOPE_OPTIONS.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return) {
        setCreateStep(createMode === 'prompt' ? 'prompt' : 'name');
        return;
      }
    }

    // Confirm step
    if (createStep === 'confirm') {
      if (key.return || input === 'y' || input === 'Y') {
        handleCreateSubmit();
        return;
      }
      if (input === 'n' || input === 'N') {
        resetCreateState();
        setMode('list');
        return;
      }
    }
  }, { isActive: mode === 'create' && !['prompt', 'name', 'description', 'tools', 'hint', 'content'].includes(createStep) });

  // Create mode input - text steps (escape/back)
  useInput((input, key) => {
    if (mode !== 'create') return;
    if (!['prompt', 'name', 'description', 'tools', 'hint', 'content'].includes(createStep)) return;
    if (!key.escape) return;

    const stepOrder: CreateStep[] = createMode === 'prompt'
      ? ['scope', 'prompt', 'name', 'description', 'tools', 'hint', 'content', 'confirm']
      : ['scope', 'name', 'description', 'tools', 'hint', 'content', 'confirm'];
    const currentIdx = stepOrder.indexOf(createStep);
    if (currentIdx > 0) {
      setCreateStep(stepOrder[currentIdx - 1]);
    } else {
      resetCreateState();
      setMode('list');
    }
  }, { isActive: mode === 'create' && ['prompt', 'name', 'description', 'tools', 'hint', 'content'].includes(createStep) });

  // List/detail/delete mode input
  useInput((input, key) => {
    if (mode === 'create') return;

    if (mode === 'delete-confirm') {
      if (input === 'y' || input === 'Y') {
        if (selectedSkill) {
          setIsSubmitting(true);
          onDelete(selectedSkill.name, selectedSkill.filePath).then(() => {
            return onRefresh();
          }).then((refreshed) => {
            setSkills(refreshed);
            setMode('list');
          }).finally(() => {
            setIsSubmitting(false);
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

    if (mode === 'detail') {
      if (key.escape || input === 'q' || input === 'Q') {
        setDetailSkill(null);
        setMode('list');
        return;
      }
      if (input === 'x' || input === 'X') {
        if (detailSkill) {
          onExecute(detailSkill.name);
          setDetailSkill(null);
          setMode('list');
          onClose();
        }
        return;
      }
      if (input === 'd' || input === 'D') {
        setMode('delete-confirm');
        return;
      }
      return;
    }

    // List mode
    if (key.escape || input === 'q' || input === 'Q') {
      onClose();
      return;
    }

    if (input === 'n' || input === 'N') {
      resetCreateState();
      setCreateMode('manual');
      setMode('create');
      return;
    }
    if (input === 'p' || input === 'P') {
      resetCreateState();
      setCreateMode('prompt');
      setMode('create');
      return;
    }

    if (key.return) {
      if (selectedIndex === sortedSkills.length) {
        // "New skill" option at bottom
        resetCreateState();
        setCreateMode('manual');
        setMode('create');
      } else if (selectedSkill) {
        // Open detail view, loading content if needed
        setIsSubmitting(true);
        onEnsureContent(selectedSkill.name).then((loaded) => {
          if (loaded) {
            setDetailSkill(loaded);
          } else {
            setDetailSkill(selectedSkill);
          }
          setMode('detail');
        }).finally(() => {
          setIsSubmitting(false);
        });
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev === 0 ? totalItems - 1 : prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev === totalItems - 1 ? 0 : prev + 1));
      return;
    }

    if (input === 'x' || input === 'X') {
      if (selectedSkill) {
        onExecute(selectedSkill.name);
        onClose();
      }
      return;
    }

    if (input === 'd' || input === 'D') {
      if (selectedSkill) setMode('delete-confirm');
      return;
    }

    if (input === 'f' || input === 'F') {
      setIsSubmitting(true);
      onRefresh().then((refreshed) => {
        setSkills(refreshed);
      }).finally(() => {
        setIsSubmitting(false);
      });
      return;
    }

    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= sortedSkills.length) {
      setSelectedIndex(num - 1);
      return;
    }
  }, { isActive: mode !== 'create' });

  // ── Create mode UI ──────────────────────────────────────────────

  if (mode === 'create') {
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg={themeColor('info')}><b>
            {createMode === 'prompt' ? 'New Skill (Prompt)' : 'New Skill'}
          </b></text>
        </box>

        <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={1}>
          {/* Step 1: Scope selection */}
          {createStep === 'scope' && (
            <box flexDirection="column">
              <text><b>Select scope:</b></text>
              <box flexDirection="column" marginTop={1}>
                {SCOPE_OPTIONS.map((opt, idx) => (
                  <box key={opt.id}>
                    <text bg={idx === createScopeIndex ? themeColor('primary') : undefined}>
                      {idx === createScopeIndex ? '>' : ' '} {opt.label.padEnd(10)} <span fg={themeColor('muted')}>{opt.desc}</span>
                    </text>
                  </box>
                ))}
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>↑↓ select | Enter confirm | Esc cancel</text>
              </box>
            </box>
          )}

          {/* Step 2: Prompt */}
          {createStep === 'prompt' && (
            <box flexDirection="column">
              <text><b>Describe what this skill should do:</b></text>
              <box marginTop={1}>
                <input
                  value={createPrompt}
                  onChange={setCreatePrompt}
                  onSubmit={handlePromptSubmit}
                  focused
                  placeholder="e.g. Summarize meeting notes and draft follow-up"
                />
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>Enter generate | Esc back</text>
              </box>
            </box>
          )}

          {/* Step 2: Name */}
          {createStep === 'name' && (
            <box flexDirection="column">
              <text><b>Enter skill name:</b></text>
              <box marginTop={1}>
                <text>Name: </text>
                <input
                  value={createName}
                  onChange={setCreateName}
                  onSubmit={() => {
                    if (createName.trim()) setCreateStep('description');
                  }}
                  focused
                  placeholder="e.g. my-helper"
                />
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>Enter next | Esc back</text>
              </box>
            </box>
          )}

          {/* Step 3: Description */}
          {createStep === 'description' && (
            <box flexDirection="column">
              <text><b>Description (optional):</b></text>
              <box marginTop={1}>
                <input
                  value={createDescription}
                  onChange={setCreateDescription}
                  onSubmit={() => setCreateStep('tools')}
                  focused
                  placeholder="What does this skill do?"
                />
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>Enter next | Esc back</text>
              </box>
            </box>
          )}

          {/* Step 4: Allowed tools */}
          {createStep === 'tools' && (
            <box flexDirection="column">
              <text><b>Allowed tools (optional, comma-separated):</b></text>
              <box marginTop={1}>
                <input
                  value={createTools}
                  onChange={setCreateTools}
                  onSubmit={() => setCreateStep('hint')}
                  focused
                  placeholder="e.g. bash, filesystem"
                />
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>Enter next | Esc back</text>
              </box>
            </box>
          )}

          {/* Step 5: Argument hint */}
          {createStep === 'hint' && (
            <box flexDirection="column">
              <text><b>Argument hint (optional):</b></text>
              <box marginTop={1}>
                <input
                  value={createHint}
                  onChange={setCreateHint}
                  onSubmit={() => setCreateStep('content')}
                  focused
                  placeholder="e.g. [filename] [options]"
                />
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>Enter next | Esc back</text>
              </box>
            </box>
          )}

          {/* Step 6: Content */}
          {createStep === 'content' && (
            <box flexDirection="column">
              <text><b>Skill content (optional, single line):</b></text>
              <box marginTop={1}>
                <input
                  value={createContent}
                  onChange={setCreateContent}
                  onSubmit={() => setCreateStep('confirm')}
                  focused
                  placeholder="Instructions for the skill (or leave empty for default template)"
                />
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>Enter next | Esc back</text>
              </box>
            </box>
          )}

          {/* Step 7: Confirm */}
          {createStep === 'confirm' && (
            <box flexDirection="column">
              <text><b>Confirm new skill:</b></text>
              <box flexDirection="column" marginTop={1} marginLeft={1}>
                <text>Scope: <span fg={themeColor('info')}>{SCOPE_OPTIONS[createScopeIndex].label}</span></text>
                <text>Name: <span fg={themeColor('info')}>{createName}</span></text>
                {createDescription && <text>Description: <span fg={themeColor('muted')}>{createDescription}</span></text>}
                {createTools && <text>Tools: <span fg={themeColor('muted')}>{createTools}</span></text>}
                {createHint && <text>Hint: <span fg={themeColor('muted')}>{createHint}</span></text>}
                {createContent && (
                  <>
                    <text>Content:</text>
                    <box marginLeft={2} flexDirection="column">
                      {createContent.split('\n').slice(0, 6).map((line, i) => (
                        <text key={i} fg={themeColor('muted')}>{line}</text>
                      ))}
                      {createContent.split('\n').length > 6 && (
                        <text fg={themeColor('muted')}>... ({createContent.split('\n').length - 6} more lines)</text>
                      )}
                    </box>
                  </>
                )}
              </box>
              <box marginTop={1}>
                <text fg={themeColor('muted')}>Enter/y create | n cancel | Esc back</text>
              </box>
            </box>
          )}

          {createError && (
            <box marginTop={1}>
              <text fg={themeColor('error')}>{createError}</text>
            </box>
          )}
        </box>

        {isSubmitting && (
          <box marginTop={1}>
            <text fg={themeColor('warning')}>
              {createMode === 'prompt' && createStep === 'prompt' ? 'Generating draft...' : 'Creating skill...'}
            </text>
          </box>
        )}
      </box>
    );
  }

  // ── Delete confirmation ─────────────────────────────────────────

  if (mode === 'delete-confirm') {
    const skill = detailSkill || selectedSkill;
    const displayName = skill?.name || '';
    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg={themeColor('error')}><b>Delete Skill</b></text>
        </box>
        <box marginBottom={1}>
          <text>
            Delete skill &quot;{displayName}&quot;?
          </text>
        </box>
        {skill && (
          <box marginBottom={1}>
            <text fg={themeColor('muted')}>File: {skill.filePath}</text>
          </box>
        )}
        <box marginTop={1}>
          <text>
            Press <span fg={themeColor('success')}><b>y</b></span> to confirm or{' '}
            <span fg={themeColor('error')}><b>n</b></span> to cancel
          </text>
        </box>
      </box>
    );
  }

  // ── Detail mode ─────────────────────────────────────────────────

  if (mode === 'detail' && detailSkill) {
    const s = detailSkill;
    const scope = getSkillScope(s.filePath);

    return (
      <box flexDirection="column" paddingY={1}>
        <box marginBottom={1}>
          <text fg={themeColor('info')}><b>Skill Details</b></text>
        </box>

        <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1} paddingY={0}>
          <box><text><b>Name: </b></text><text fg={themeColor('info')}>{s.name}</text></box>
          <box><text><b>Scope: </b></text><text>{scope}</text>{s.source && <text fg={themeColor('muted')}> ({s.source})</text>}{s.version && <text fg={themeColor('muted')}> v{s.version}</text>}</box>
          {s.description && <box><text><b>Description: </b></text><text>{s.description}</text></box>}
          {s.argumentHint && <box><text><b>Argument Hint: </b></text><text>{s.argumentHint}</text></box>}
          {s.allowedTools && s.allowedTools.length > 0 && (
            <box><text><b>Allowed Tools: </b></text><text>{s.allowedTools.join(', ')}</text></box>
          )}
          {s.model && <box><text><b>Model: </b></text><text>{s.model}</text></box>}
          <box><text><b>File: </b></text><text fg={themeColor('muted')}>{s.filePath}</text></box>

          {s.contentLoaded && s.content && (
            <>
              <box marginTop={1}><text><b>Content:</b></text></box>
              <box marginLeft={2} flexDirection="column">
                {s.content.split('\n').slice(0, 20).map((line, i) => (
                  <text key={i} wrapMode="word" fg={themeColor('muted')}>{line}</text>
                ))}
                {s.content.split('\n').length > 20 && (
                  <text fg={themeColor('muted')}>... ({s.content.split('\n').length - 20} more lines)</text>
                )}
              </box>
            </>
          )}
        </box>

        <box marginTop={1}>
          <text fg={themeColor('muted')}>
            e[x]ecute | [d]elete | Esc/q back
          </text>
        </box>

        {isSubmitting && <box marginTop={1}><text fg={themeColor('warning')}>Loading...</text></box>}
      </box>
    );
  }

  // ── List mode ───────────────────────────────────────────────────

  const totalSkills = sortedSkills.length;
  const selectedForRange = totalSkills === 0 ? 0 : Math.min(selectedIndex, totalSkills - 1);
  const skillRange = getVisibleRange(selectedForRange, totalSkills, MAX_VISIBLE_SKILLS);
  const visibleSkills = sortedSkills.slice(skillRange.start, skillRange.end);
  const visibleEntries = visibleSkills.map((skill, offset) => {
    const actualIdx = skillRange.start + offset;
    const group: 'project' | 'global' = actualIdx < projectSkills.length ? 'project' : 'global';
    return { skill, actualIdx, group };
  });
  let lastGroup: 'project' | 'global' | null = null;

  return (
    <box flexDirection="column" paddingY={1}>
      <box flexDirection="row" marginBottom={1} justifyContent="space-between">
        <text><b>Skills</b></text>
        <text fg={themeColor('muted')}>[n]ew [p]rompt e[x]ecute [d]elete re[f]resh</text>
      </box>

      <box marginBottom={1}>
        <text fg={themeColor('muted')}>
          {sortedSkills.length} skill(s) — {projectSkills.length} project, {globalSkills.length} global
        </text>
      </box>

      <box flexDirection="column" borderStyle="rounded" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
        {sortedSkills.length === 0 ? (
          <box paddingY={1}>
            <text fg={themeColor('muted')}>No skills loaded. Press n to create one.</text>
          </box>
        ) : (
          <>
            {skillRange.hasMore.above > 0 && (
              <box paddingY={0}>
                <text fg={themeColor('muted')}>  ↑ {skillRange.hasMore.above} more above</text>
              </box>
            )}
            {visibleEntries.map((entry) => {
              const desc = entry.skill.description ? ` - ${entry.skill.description}` : '';
              const isSelected = entry.actualIdx === selectedIndex;
              const header = entry.group !== lastGroup
                ? (
                  <box marginTop={lastGroup ? 1 : 0}>
                    <text fg={themeColor('muted')}><b>
                      {entry.group === 'project' ? 'Project Skills' : 'Global Skills'}
                    </b></text>
                  </box>
                )
                : null;
              lastGroup = entry.group;
              const badge = entry.skill.source === 'npm' ? ' [npm]' : '';
              return (
                <React.Fragment key={`${entry.skill.name}-${entry.actualIdx}`}>
                  {header}
                  <box paddingY={0}>
                    <text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : undefined}>
                      {isSelected ? '>' : ' '} {(entry.actualIdx + 1).toString().padStart(2)}. {entry.skill.name.padEnd(20)}{desc.slice(0, 40)}{badge}
                    </text>
                  </box>
                </React.Fragment>
              );
            })}
            {skillRange.hasMore.below > 0 && (
              <box paddingY={0}>
                <text fg={themeColor('muted')}>  ↓ {skillRange.hasMore.below} more below</text>
              </box>
            )}
          </>
        )}

        {/* New skill option at bottom */}
        <box marginTop={1} paddingY={0}>
          <text
            bg={selectedIndex === sortedSkills.length ? themeColor('primary') : undefined}
            fg={selectedIndex === sortedSkills.length ? themeColor('text') : "gray"}
          >
            + New skill (n) | Prompt (p)
          </text>
        </box>
      </box>

      {/* Compact preview of selected */}
      {selectedSkill && selectedIndex < sortedSkills.length && (
        <box marginTop={1}>
          <text fg={themeColor('muted')}>
            {getSkillScope(selectedSkill.filePath)} | {selectedSkill.argumentHint || 'no args'} | Enter for details
          </text>
        </box>
      )}

      <box marginTop={1}>
        <text fg={themeColor('muted')}>Enter view | ↑↓ navigate | [n]ew | [p]rompt | [d]elete | e[x]ecute | q quit</text>
      </box>

      {isSubmitting && <box marginTop={1}><text fg={themeColor('warning')}>Processing...</text></box>}
    </box>
  );
}
