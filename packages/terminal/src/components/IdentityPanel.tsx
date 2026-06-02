import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { Identity, CreateIdentityOptions } from '@hasna/assistants-core';
import { Box, Text, TextInput, useInput } from '../ui/ink';
import { themeColor } from '../theme/colors';

// Maximum visible items in lists before pagination kicks in
const MAX_VISIBLE_ITEMS = 5;

type ViewMode = 'list' | 'detail' | 'create' | 'create-form' | 'edit-form' | 'delete-confirm';
type FormStep =
  | 'name'
  | 'displayName'
  | 'title'
  | 'company'
  | 'email'
  | 'phone'
  | 'addressStreet'
  | 'addressCity'
  | 'addressState'
  | 'addressPostal'
  | 'addressCountry'
  | 'virtualAddress'
  | 'communicationStyle'
  | 'responseLength'
  | 'context';

const COMMUNICATION_STYLES = ['formal', 'casual', 'professional'] as const;
const RESPONSE_LENGTHS = ['concise', 'detailed', 'balanced'] as const;

type FinalFormOverrides = {
  context?: string;
};

interface IdentityPanelProps {
  identities: Identity[];
  activeIdentityId?: string;
  initialIdentityId?: string;
  initialMode?: 'detail' | 'edit';
  templates: Array<{ name: string; description: string }>;
  onSwitch: (identityId: string) => Promise<void>;
  onCreate: (options: CreateIdentityOptions) => Promise<void>;
  onCreateFromTemplate: (templateName: string) => Promise<void>;
  onUpdate: (identityId: string, updates: Partial<CreateIdentityOptions>) => Promise<void>;
  onSetDefault: (identityId: string) => Promise<void>;
  onDelete: (identityId: string) => Promise<void>;
  onClose: () => void;
  error?: string | null;
}

/**
 * Calculate the visible window range for paginated lists
 */
function getVisibleRange(
  selectedIndex: number,
  totalItems: number,
  maxVisible: number = MAX_VISIBLE_ITEMS
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

/**
 * Interactive panel for managing identities
 */
export function IdentityPanel({
  identities,
  activeIdentityId,
  initialIdentityId,
  initialMode,
  templates,
  onSwitch,
  onCreate,
  onCreateFromTemplate,
  onUpdate,
  onSetDefault,
  onDelete,
  onClose,
  error,
}: IdentityPanelProps) {
  const [mode, setMode] = useState<ViewMode>('list');
  const [identityIndex, setIdentityIndex] = useState(0);
  const [templateIndex, setTemplateIndex] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Identity | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const didApplyInitialRef = useRef(false);

  // Form state
  const [formStep, setFormStep] = useState<FormStep>('name');
  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddressStreet, setFormAddressStreet] = useState('');
  const [formAddressCity, setFormAddressCity] = useState('');
  const [formAddressState, setFormAddressState] = useState('');
  const [formAddressPostal, setFormAddressPostal] = useState('');
  const [formAddressCountry, setFormAddressCountry] = useState('');
  const [formVirtualAddress, setFormVirtualAddress] = useState('');
  const [formStyleIndex, setFormStyleIndex] = useState(2); // 'professional'
  const [formLengthIndex, setFormLengthIndex] = useState(2); // 'balanced'
  const [formContext, setFormContext] = useState('');
  const [editingIdentity, setEditingIdentity] = useState<Identity | null>(null);

  // Jump to active identity on mount
  useEffect(() => {
    if (activeIdentityId) {
      const idx = identities.findIndex((i) => i.id === activeIdentityId);
      if (idx !== -1) {
        setIdentityIndex(idx);
      }
    }
  }, [activeIdentityId, identities]);

  useEffect(() => {
    setIdentityIndex((prev) => Math.min(prev, Math.max(0, identities.length - 1)));
  }, [identities.length]);

  useEffect(() => {
    const totalCreateOptions = templates.length + 1;
    setTemplateIndex((prev) => Math.min(prev, Math.max(0, totalCreateOptions - 1)));
  }, [templates.length]);

  // Calculate visible range for identity list
  const identityRange = useMemo(
    () => getVisibleRange(identityIndex, identities.length),
    [identityIndex, identities.length]
  );

  // Calculate visible range for templates list (+1 for "Create custom" option)
  const totalCreateOptions = templates.length + 1;
  const templateRange = useMemo(
    () => getVisibleRange(templateIndex, totalCreateOptions),
    [templateIndex, totalCreateOptions]
  );

  const resetForm = useCallback(() => {
    setFormStep('name');
    setFormName('');
    setFormDisplayName('');
    setFormTitle('');
    setFormCompany('');
    setFormEmail('');
    setFormPhone('');
    setFormAddressStreet('');
    setFormAddressCity('');
    setFormAddressState('');
    setFormAddressPostal('');
    setFormAddressCountry('');
    setFormVirtualAddress('');
    setFormStyleIndex(2);
    setFormLengthIndex(2);
    setFormContext('');
    setEditingIdentity(null);
  }, []);

  const currentIdentity = identities[identityIndex];

  useEffect(() => {
    if (mode === 'detail' && !currentIdentity) {
      setMode('list');
      return;
    }
    if (mode === 'delete-confirm' && (!deleteTarget || !identities.some((i) => i.id === deleteTarget.id))) {
      setDeleteTarget(null);
      setMode('list');
      return;
    }
    if (mode === 'edit-form' && (!editingIdentity || !identities.some((i) => i.id === editingIdentity.id))) {
      resetForm();
      setMode('list');
    }
  }, [mode, currentIdentity, deleteTarget, identities, editingIdentity, resetForm]);

  const populateFormFromIdentity = useCallback((identity: Identity) => {
    setFormName(identity.name);
    setFormDisplayName(identity.profile.displayName);
    setFormTitle(identity.profile.title || '');
    setFormCompany(identity.profile.company || '');
    const primaryEmail = identity.contacts.emails.find((entry) => entry.isPrimary) || identity.contacts.emails[0];
    const primaryPhone = identity.contacts.phones.find((entry) => entry.isPrimary) || identity.contacts.phones[0];
    const primaryVirtual = identity.contacts.virtualAddresses?.find((entry) => entry.isPrimary) || identity.contacts.virtualAddresses?.[0];
    const primaryAddress = identity.contacts.addresses[0];
    setFormEmail(primaryEmail?.value || '');
    setFormPhone(primaryPhone?.value || '');
    setFormAddressStreet(primaryAddress?.street || '');
    setFormAddressCity(primaryAddress?.city || '');
    setFormAddressState(primaryAddress?.state || '');
    setFormAddressPostal(primaryAddress?.postalCode || '');
    setFormAddressCountry(primaryAddress?.country || '');
    setFormVirtualAddress(primaryVirtual?.value || '');
    const styleIdx = COMMUNICATION_STYLES.indexOf(identity.preferences.communicationStyle);
    const lengthIdx = RESPONSE_LENGTHS.indexOf(identity.preferences.responseLength);
    setFormStyleIndex(styleIdx >= 0 ? styleIdx : 2);
    setFormLengthIndex(lengthIdx >= 0 ? lengthIdx : 2);
    setFormContext(identity.context || '');
    setFormStep('name');
  }, []);

  const buildContactsFromForm = useCallback((): CreateIdentityOptions['contacts'] => {
    const email = formEmail.trim();
    const phone = formPhone.trim();
    const virtualAddress = formVirtualAddress.trim();
    const street = formAddressStreet.trim();
    const city = formAddressCity.trim();
    const postalCode = formAddressPostal.trim();
    const country = formAddressCountry.trim();
    const hasAddress = Boolean(street && city && postalCode && country);

    return {
      emails: email ? [{ value: email, label: 'Primary', isPrimary: true }] : [],
      phones: phone ? [{ value: phone, label: 'Primary', isPrimary: true }] : [],
      addresses: hasAddress ? [{
        street,
        city,
        state: formAddressState.trim() || undefined,
        postalCode,
        country,
        label: 'Primary',
      }] : [],
      virtualAddresses: virtualAddress ? [{ value: virtualAddress, label: 'Primary', isPrimary: true }] : [],
    };
  }, [
    formEmail,
    formPhone,
    formVirtualAddress,
    formAddressStreet,
    formAddressCity,
    formAddressState,
    formAddressPostal,
    formAddressCountry,
  ]);

  useEffect(() => {
    if (didApplyInitialRef.current) return;
    if (!initialIdentityId && !initialMode) return;
    if (identities.length === 0) return;

    let targetIndex = identityIndex;
    if (initialIdentityId) {
      const idx = identities.findIndex((i) => i.id === initialIdentityId);
      if (idx === -1) return;
      targetIndex = idx;
      setIdentityIndex(idx);
    }

    const targetIdentity = identities[targetIndex];
    if (!targetIdentity) return;

    if (initialMode === 'detail') {
      setMode('detail');
    } else if (initialMode === 'edit') {
      setEditingIdentity(targetIdentity);
      populateFormFromIdentity(targetIdentity);
      setMode('edit-form');
    }

    didApplyInitialRef.current = true;
  }, [identities, identityIndex, initialIdentityId, initialMode, populateFormFromIdentity]);

  // Handle create from template
  const handleCreateFromTemplate = useCallback(async () => {
    const template = templates[templateIndex - 1]; // offset by 1 for "Create custom" option
    if (!template) return;

    setIsProcessing(true);
    try {
      await onCreateFromTemplate(template.name);
      setMode('list');
    } finally {
      setIsProcessing(false);
    }
  }, [templateIndex, templates, onCreateFromTemplate]);

  // Handle create from form
  const handleCreateFromForm = useCallback(async (overrides: FinalFormOverrides = {}) => {
    if (!formName.trim()) return;

    const context = (overrides.context ?? formContext).trim();

    setIsProcessing(true);
    try {
      await onCreate({
        name: formName.trim(),
        profile: {
          displayName: formDisplayName.trim() || formName.trim(),
          title: formTitle.trim() || undefined,
          company: formCompany.trim() || undefined,
        },
        contacts: buildContactsFromForm(),
        preferences: {
          communicationStyle: COMMUNICATION_STYLES[formStyleIndex],
          responseLength: RESPONSE_LENGTHS[formLengthIndex],
        },
        context: context || undefined,
      });
      resetForm();
      setMode('list');
    } finally {
      setIsProcessing(false);
    }
  }, [
    formName,
    formDisplayName,
    formTitle,
    formCompany,
    formStyleIndex,
    formLengthIndex,
    formContext,
    onCreate,
    resetForm,
    buildContactsFromForm,
  ]);

  // Handle edit form submit
  const handleEditSubmit = useCallback(async (overrides: FinalFormOverrides = {}) => {
    if (!editingIdentity || !formName.trim()) return;

    const context = (overrides.context ?? formContext).trim();

    setIsProcessing(true);
    try {
      await onUpdate(editingIdentity.id, {
        name: formName.trim(),
        profile: {
          displayName: formDisplayName.trim() || formName.trim(),
          title: formTitle.trim() || undefined,
          company: formCompany.trim() || undefined,
        },
        contacts: buildContactsFromForm(),
        preferences: {
          communicationStyle: COMMUNICATION_STYLES[formStyleIndex],
          responseLength: RESPONSE_LENGTHS[formLengthIndex],
        },
        context: context || undefined,
      });
      resetForm();
      setMode('list');
    } finally {
      setIsProcessing(false);
    }
  }, [
    editingIdentity,
    formName,
    formDisplayName,
    formTitle,
    formCompany,
    formStyleIndex,
    formLengthIndex,
    formContext,
    onUpdate,
    resetForm,
    buildContactsFromForm,
  ]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setIsProcessing(true);
    try {
      await onDelete(deleteTarget.id);
      setMode('list');
      setDeleteTarget(null);
      // Adjust index if needed
      if (identityIndex >= identities.length - 1 && identityIndex > 0) {
        setIdentityIndex(identityIndex - 1);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [deleteTarget, onDelete, identityIndex, identities.length]);

  // Handle switch
  const handleSwitch = useCallback(async () => {
    if (!currentIdentity || currentIdentity.id === activeIdentityId) return;

    setIsProcessing(true);
    try {
      await onSwitch(currentIdentity.id);
    } finally {
      setIsProcessing(false);
    }
  }, [currentIdentity, activeIdentityId, onSwitch]);

  // Handle set default
  const handleSetDefault = useCallback(async () => {
    if (!currentIdentity || currentIdentity.isDefault) return;

    setIsProcessing(true);
    try {
      await onSetDefault(currentIdentity.id);
    } finally {
      setIsProcessing(false);
    }
  }, [currentIdentity, onSetDefault]);

  // Form step navigation helpers
  const FORM_STEPS: FormStep[] = [
    'name',
    'displayName',
    'title',
    'company',
    'email',
    'phone',
    'addressStreet',
    'addressCity',
    'addressState',
    'addressPostal',
    'addressCountry',
    'virtualAddress',
    'communicationStyle',
    'responseLength',
    'context',
  ];

  const goToNextStep = useCallback(() => {
    const idx = FORM_STEPS.indexOf(formStep);
    if (idx < FORM_STEPS.length - 1) {
      setFormStep(FORM_STEPS[idx + 1]);
    }
  }, [formStep]);

  const goToPrevStep = useCallback(() => {
    const idx = FORM_STEPS.indexOf(formStep);
    if (idx > 0) {
      setFormStep(FORM_STEPS[idx - 1]);
    }
  }, [formStep]);

  const isTextStep =
    formStep === 'name' ||
    formStep === 'displayName' ||
    formStep === 'title' ||
    formStep === 'company' ||
    formStep === 'email' ||
    formStep === 'phone' ||
    formStep === 'addressStreet' ||
    formStep === 'addressCity' ||
    formStep === 'addressState' ||
    formStep === 'addressPostal' ||
    formStep === 'addressCountry' ||
    formStep === 'virtualAddress' ||
    formStep === 'context';
  const isSelectorStep = formStep === 'communicationStyle' || formStep === 'responseLength';
  const isFormMode = mode === 'create-form' || mode === 'edit-form';

  // Keyboard navigation for list/detail/create/delete modes
  useInput((input, key) => {
    if (isProcessing || isFormMode) return;

    // Exit with q or Escape at top level
    if (input === 'q' || ((key.escape || input === '\x1b') && mode === 'list')) {
      onClose();
      return;
    }

    // Escape to go back
    if (key.escape || input === '\x1b') {
      if (mode === 'detail' || mode === 'create') {
        setMode('list');
      } else if (mode === 'delete-confirm') {
        setMode('detail');
        setDeleteTarget(null);
      }
      return;
    }

    // List mode navigation
    if (mode === 'list') {
      if (input === 'n' || input === 'c') {
        setMode('create');
        setTemplateIndex(0);
        return;
      }
      if (identities.length === 0) {
        return;
      }
      if (key.upArrow) {
        setIdentityIndex((prev) => (prev === 0 ? identities.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setIdentityIndex((prev) => (prev === identities.length - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return && currentIdentity) {
        setMode('detail');
        return;
      }
      // Number keys for quick selection
      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= identities.length) {
        setIdentityIndex(num - 1);
      }
      return;
    }

    // Detail mode
    if (mode === 'detail') {
      if (input === 's') {
        handleSwitch();
        return;
      }
      if (input === 'd') {
        handleSetDefault();
        return;
      }
      if (input === 'e') {
        if (currentIdentity) {
          setEditingIdentity(currentIdentity);
          populateFormFromIdentity(currentIdentity);
          setMode('edit-form');
        }
        return;
      }
      if (input === 'x' || key.delete) {
        if (currentIdentity) {
          setDeleteTarget(currentIdentity);
          setMode('delete-confirm');
        }
        return;
      }
      return;
    }

    // Create mode (template selection + custom option)
    if (mode === 'create') {
      if (key.upArrow) {
        setTemplateIndex((prev) => (prev === 0 ? totalCreateOptions - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setTemplateIndex((prev) => (prev === totalCreateOptions - 1 ? 0 : prev + 1));
        return;
      }
      if (key.return) {
        if (templateIndex === 0) {
          // "Create custom identity" selected
          resetForm();
          setMode('create-form');
        } else {
          handleCreateFromTemplate();
        }
        return;
      }
      return;
    }

    // Delete confirm mode
    if (mode === 'delete-confirm') {
      if (input === 'y') {
        handleDelete();
        return;
      }
      if (input === 'n') {
        setMode('detail');
        setDeleteTarget(null);
        return;
      }
    }
  }, { isActive: !isFormMode });

  // Form mode: text input steps - escape handling
  useInput((_input, key) => {
    if (!isFormMode || !isTextStep) return;

    if (key.escape || _input === '\x1b') {
      if (formStep === 'name') {
        resetForm();
        setMode(mode === 'edit-form' ? 'detail' : 'create');
      } else {
        goToPrevStep();
      }
    }
  }, { isActive: isFormMode && isTextStep });

  // Form mode: selector steps
  useInput((input, key) => {
    if (!isFormMode || !isSelectorStep) return;

    if (formStep === 'communicationStyle') {
      if (key.upArrow) {
        setFormStyleIndex((prev) => (prev === 0 ? COMMUNICATION_STYLES.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setFormStyleIndex((prev) => (prev === COMMUNICATION_STYLES.length - 1 ? 0 : prev + 1));
        return;
      }
    }

    if (formStep === 'responseLength') {
      if (key.upArrow) {
        setFormLengthIndex((prev) => (prev === 0 ? RESPONSE_LENGTHS.length - 1 : prev - 1));
        return;
      }
      if (key.downArrow) {
        setFormLengthIndex((prev) => (prev === RESPONSE_LENGTHS.length - 1 ? 0 : prev + 1));
        return;
      }
    }

    if (key.return) {
      goToNextStep();
      return;
    }

    if (key.escape || input === '\x1b') {
      goToPrevStep();
      return;
    }
  }, { isActive: isFormMode && isSelectorStep });

  // Form text submit handlers
  const handleFormNameSubmit = (value: string) => {
    const nextValue = value.trim();
    if (!nextValue) return;
    setFormName(nextValue);
    goToNextStep();
  };

  const handleFormDisplayNameSubmit = (value: string) => {
    setFormDisplayName(value.trim());
    goToNextStep();
  };

  const handleFormTitleSubmit = (value: string) => {
    setFormTitle(value.trim());
    goToNextStep();
  };

  const handleFormCompanySubmit = (value: string) => {
    setFormCompany(value.trim());
    goToNextStep();
  };

  const handleFormEmailSubmit = (value: string) => {
    setFormEmail(value.trim());
    goToNextStep();
  };

  const handleFormPhoneSubmit = (value: string) => {
    setFormPhone(value.trim());
    goToNextStep();
  };

  const handleFormAddressStreetSubmit = (value: string) => {
    setFormAddressStreet(value.trim());
    goToNextStep();
  };

  const handleFormAddressCitySubmit = (value: string) => {
    setFormAddressCity(value.trim());
    goToNextStep();
  };

  const handleFormAddressStateSubmit = (value: string) => {
    setFormAddressState(value.trim());
    goToNextStep();
  };

  const handleFormAddressPostalSubmit = (value: string) => {
    setFormAddressPostal(value.trim());
    goToNextStep();
  };

  const handleFormAddressCountrySubmit = (value: string) => {
    setFormAddressCountry(value.trim());
    goToNextStep();
  };

  const handleFormVirtualAddressSubmit = (value: string) => {
    setFormVirtualAddress(value.trim());
    goToNextStep();
  };

  const handleFormContextSubmit = (value: string) => {
    const context = value.trim();
    setFormContext(context);
    if (mode === 'create-form') {
      handleCreateFromForm({ context });
    } else {
      handleEditSubmit({ context });
    }
  };

  // Render form summary of completed steps
  const renderFormSummary = () => {
    const steps = FORM_STEPS;
    const currentIdx = steps.indexOf(formStep);
    const completedFields: Array<{ label: string; value: string }> = [];

    const stepIndex = (step: FormStep) => steps.indexOf(step);

    if (currentIdx > stepIndex('name')) completedFields.push({ label: 'Name', value: formName });
    if (currentIdx > stepIndex('displayName') && formDisplayName) completedFields.push({ label: 'Display Name', value: formDisplayName });
    if (currentIdx > stepIndex('title') && formTitle) completedFields.push({ label: 'Role', value: formTitle });
    if (currentIdx > stepIndex('company') && formCompany) completedFields.push({ label: 'Company', value: formCompany });
    if (currentIdx > stepIndex('email') && formEmail) completedFields.push({ label: 'Email', value: formEmail });
    if (currentIdx > stepIndex('phone') && formPhone) completedFields.push({ label: 'Phone', value: formPhone });

    const addressSummary = [
      formAddressStreet,
      formAddressCity,
      formAddressState,
      formAddressPostal,
      formAddressCountry,
    ].filter(Boolean).join(', ');
    if (currentIdx > stepIndex('addressCountry') && addressSummary) {
      completedFields.push({ label: 'Address', value: addressSummary });
    }
    if (currentIdx > stepIndex('virtualAddress') && formVirtualAddress) {
      completedFields.push({ label: 'Virtual', value: formVirtualAddress });
    }

    if (currentIdx > stepIndex('communicationStyle')) {
      completedFields.push({ label: 'Style', value: COMMUNICATION_STYLES[formStyleIndex] });
    }
    if (currentIdx > stepIndex('responseLength')) {
      completedFields.push({ label: 'Response', value: RESPONSE_LENGTHS[formLengthIndex] });
    }

    if (completedFields.length === 0) return null;

    return (
      <Box marginBottom={1} flexDirection="column">
        {completedFields.map((field) => (
          <Text key={field.label} fg={themeColor('muted')}>{field.label}: {field.value}</Text>
        ))}
      </Box>
    );
  };

  // Empty state
  if (identities.length === 0 && mode === 'list') {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text fg={themeColor('info')}>Identities</Text>
        </Box>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          paddingY={1}
        >
          <Text fg={themeColor('muted')}>No identities found.</Text>
          <Text fg={themeColor('muted')}>Press n to create a new identity.</Text>
        </Box>
        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>n new | q quit</Text>
        </Box>
      </Box>
    );
  }

  // Delete confirmation
  if (mode === 'delete-confirm' && deleteTarget) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text fg={themeColor('error')}>Delete Identity</Text>
        </Box>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          paddingY={1}
        >
          <Text>Are you sure you want to delete "{deleteTarget.name}"?</Text>
          <Text fg={themeColor('muted')}>This action cannot be undone.</Text>
        </Box>
        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>y confirm | n cancel</Text>
        </Box>
      </Box>
    );
  }

  // Create mode (template selection + custom)
  if (mode === 'create') {
    const allOptions = [
      { name: 'Create custom identity', description: 'Fill out a form with custom fields' },
      ...templates,
    ];
    const visibleOptions = allOptions.slice(templateRange.start, templateRange.end);

    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text fg={themeColor('info')}>Create Identity{totalCreateOptions > MAX_VISIBLE_ITEMS ? ` (${templateIndex + 1}/${totalCreateOptions})` : ''}</Text>
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
        >
          {templateRange.hasMore.above > 0 && (
            <Box paddingY={0}>
              <Text fg={themeColor('muted')}>  ↑ {templateRange.hasMore.above} more above</Text>
            </Box>
          )}

          {visibleOptions.map((option, visibleIdx) => {
            const actualIdx = templateRange.start + visibleIdx;
            const isSelected = actualIdx === templateIndex;
            const prefix = isSelected ? '> ' : '  ';

            return (
              <Box key={option.name} paddingY={0}>
                <Text
                  bg={isSelected ? themeColor('primary') : undefined}
                  fg={isSelected ? themeColor('text') : undefined}
                >
                  {prefix}{option.name.padEnd(24)} {option.description}
                </Text>
              </Box>
            );
          })}

          {templateRange.hasMore.below > 0 && (
            <Box paddingY={0}>
              <Text fg={themeColor('muted')}>  ↓ {templateRange.hasMore.below} more below</Text>
            </Box>
          )}
        </Box>

        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>↑↓ select | Enter create | Esc back</Text>
        </Box>
      </Box>
    );
  }

  // Create form / Edit form
  if (mode === 'create-form' || mode === 'edit-form') {
    const isEdit = mode === 'edit-form';
    const stepIdx = FORM_STEPS.indexOf(formStep);
    const stepLabel = `Step ${stepIdx + 1}/${FORM_STEPS.length}`;

    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text fg={themeColor('info')}>{isEdit ? 'Edit Identity' : 'Create Custom Identity'} - {stepLabel}</Text>
        </Box>

        {renderFormSummary()}

        {formStep === 'name' && (
          <Box flexDirection="column">
            <Box>
              <Text>Name: </Text>
              <TextInput
                value={formName}
                onChange={setFormName}
                onSubmit={handleFormNameSubmit}
                focus
                allowEmptySubmit
                placeholder="Identity name (required)..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc to {isEdit ? 'cancel' : 'go back'}</Text>
            </Box>
          </Box>
        )}

        {formStep === 'displayName' && (
          <Box flexDirection="column">
            <Box>
              <Text>Display Name: </Text>
              <TextInput
                value={formDisplayName}
                onChange={setFormDisplayName}
                onSubmit={handleFormDisplayNameSubmit}
                focus
                allowEmptySubmit
                placeholder={`Display name (default: ${formName})...`}
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc back</Text>
            </Box>
          </Box>
        )}

        {formStep === 'title' && (
          <Box flexDirection="column">
            <Box>
              <Text>Role: </Text>
              <TextInput
                value={formTitle}
                onChange={setFormTitle}
                onSubmit={handleFormTitleSubmit}
                focus
                allowEmptySubmit
                placeholder="Role or title (optional)..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc back</Text>
            </Box>
          </Box>
        )}

        {formStep === 'company' && (
          <Box flexDirection="column">
            <Box>
              <Text>Company: </Text>
              <TextInput
                value={formCompany}
                onChange={setFormCompany}
                onSubmit={handleFormCompanySubmit}
                focus
                allowEmptySubmit
                placeholder="Company name (optional)..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc back</Text>
            </Box>
          </Box>
        )}

        {formStep === 'email' && (
          <Box flexDirection="column">
            <Box>
              <Text>Email: </Text>
              <TextInput
                value={formEmail}
                onChange={setFormEmail}
                onSubmit={handleFormEmailSubmit}
                focus
                allowEmptySubmit
                placeholder="Primary email (optional)..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc back</Text>
            </Box>
          </Box>
        )}

        {formStep === 'phone' && (
          <Box flexDirection="column">
            <Box>
              <Text>Phone: </Text>
              <TextInput
                value={formPhone}
                onChange={setFormPhone}
                onSubmit={handleFormPhoneSubmit}
                focus
                allowEmptySubmit
                placeholder="Primary phone (optional)..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc back</Text>
            </Box>
          </Box>
        )}

        {formStep === 'addressStreet' && (
          <Box flexDirection="column">
            <Box>
              <Text>Address (Street): </Text>
              <TextInput
                value={formAddressStreet}
                onChange={setFormAddressStreet}
                onSubmit={handleFormAddressStreetSubmit}
                focus
                allowEmptySubmit
                placeholder="123 Main St (optional)..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc back</Text>
            </Box>
          </Box>
        )}

        {formStep === 'addressCity' && (
          <Box flexDirection="column">
            <Box>
              <Text>Address (City): </Text>
              <TextInput
                value={formAddressCity}
                onChange={setFormAddressCity}
                onSubmit={handleFormAddressCitySubmit}
                focus
                allowEmptySubmit
                placeholder="City (optional)..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc back</Text>
            </Box>
          </Box>
        )}

        {formStep === 'addressState' && (
          <Box flexDirection="column">
            <Box>
              <Text>Address (State): </Text>
              <TextInput
                value={formAddressState}
                onChange={setFormAddressState}
                onSubmit={handleFormAddressStateSubmit}
                focus
                allowEmptySubmit
                placeholder="State/Region (optional)..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc back</Text>
            </Box>
          </Box>
        )}

        {formStep === 'addressPostal' && (
          <Box flexDirection="column">
            <Box>
              <Text>Address (Postal): </Text>
              <TextInput
                value={formAddressPostal}
                onChange={setFormAddressPostal}
                onSubmit={handleFormAddressPostalSubmit}
                focus
                allowEmptySubmit
                placeholder="Postal code (optional)..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc back</Text>
            </Box>
          </Box>
        )}

        {formStep === 'addressCountry' && (
          <Box flexDirection="column">
            <Box>
              <Text>Address (Country): </Text>
              <TextInput
                value={formAddressCountry}
                onChange={setFormAddressCountry}
                onSubmit={handleFormAddressCountrySubmit}
                focus
                allowEmptySubmit
                placeholder="Country (optional)..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc back</Text>
            </Box>
          </Box>
        )}

        {formStep === 'virtualAddress' && (
          <Box flexDirection="column">
            <Box>
              <Text>Virtual Address: </Text>
              <TextInput
                value={formVirtualAddress}
                onChange={setFormVirtualAddress}
                onSubmit={handleFormVirtualAddressSubmit}
                focus
                allowEmptySubmit
                placeholder="Handle, URL, or DID (optional)..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to continue | Esc back</Text>
            </Box>
          </Box>
        )}

        {formStep === 'communicationStyle' && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text>Communication Style:</Text>
            </Box>
            <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
              {COMMUNICATION_STYLES.map((style, index) => (
                <Box key={style} paddingY={0}>
                  <Text
                    bg={index === formStyleIndex ? themeColor('primary') : undefined}
                    fg={index === formStyleIndex ? themeColor('text') : undefined}
                  >
                    {index === formStyleIndex ? '>' : ' '} {style}
                  </Text>
                </Box>
              ))}
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>↑↓ select | Enter continue | Esc back</Text>
            </Box>
          </Box>
        )}

        {formStep === 'responseLength' && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text>Response Length:</Text>
            </Box>
            <Box flexDirection="column" borderStyle="round" borderColor={themeColor('border')} border={["top", "bottom"]} paddingX={1}>
              {RESPONSE_LENGTHS.map((length, index) => (
                <Box key={length} paddingY={0}>
                  <Text
                    bg={index === formLengthIndex ? themeColor('primary') : undefined}
                    fg={index === formLengthIndex ? themeColor('text') : undefined}
                  >
                    {index === formLengthIndex ? '>' : ' '} {length}
                  </Text>
                </Box>
              ))}
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>↑↓ select | Enter continue | Esc back</Text>
            </Box>
          </Box>
        )}

        {formStep === 'context' && (
          <Box flexDirection="column">
            <Box>
              <Text>Context: </Text>
              <TextInput
                value={formContext}
                onChange={setFormContext}
                onSubmit={handleFormContextSubmit}
                focus
                allowEmptySubmit
                placeholder="Custom personality notes (optional)..."
              />
            </Box>
            <Box marginTop={1}>
              <Text fg={themeColor('muted')}>Enter to {isEdit ? 'save' : 'create'} | Esc back</Text>
            </Box>
          </Box>
        )}

        {isProcessing && (
          <Box marginTop={1}>
            <Text fg={themeColor('warning')}>{isEdit ? 'Saving...' : 'Creating...'}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // Detail view
  if (mode === 'detail' && currentIdentity) {
    const isActive = currentIdentity.id === activeIdentityId;

    return (
      <Box flexDirection="column" paddingY={1}>
        <Box marginBottom={1}>
          <Text fg={themeColor('info')}>
            {currentIdentity.name}{currentIdentity.isDefault ? ' (default)' : ''}{isActive ? ' (active)' : ''}
          </Text>
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={themeColor('border')} border={["top", "bottom"]}
          paddingX={1}
          paddingY={1}
        >
          <Box marginBottom={1}>
            <Text>Profile</Text>
          </Box>
          <Box marginLeft={2}>
            <Text>{`Display Name: ${currentIdentity.profile.displayName}`}</Text>
          </Box>
          {currentIdentity.profile.title && (
            <Box marginLeft={2}>
              <Text>{`Role: ${currentIdentity.profile.title}`}</Text>
            </Box>
          )}
          {currentIdentity.profile.company && (
            <Box marginLeft={2}>
              <Text>{`Company: ${currentIdentity.profile.company}`}</Text>
            </Box>
          )}
          <Box marginLeft={2}>
            <Text>{`Timezone: ${currentIdentity.profile.timezone}`}</Text>
          </Box>

          <Box marginTop={1} marginBottom={1}>
            <Text>Preferences</Text>
          </Box>
          <Box marginLeft={2}>
            <Text>{`Language: ${currentIdentity.preferences.language}`}</Text>
          </Box>
          <Box marginLeft={2}>
            <Text>{`Style: ${currentIdentity.preferences.communicationStyle}`}</Text>
          </Box>
          <Box marginLeft={2}>
            <Text>{`Response: ${currentIdentity.preferences.responseLength}`}</Text>
          </Box>

          {(currentIdentity.contacts.emails.length > 0 ||
            currentIdentity.contacts.phones.length > 0 ||
            currentIdentity.contacts.addresses.length > 0 ||
            (currentIdentity.contacts.virtualAddresses && currentIdentity.contacts.virtualAddresses.length > 0)) && (
            <>
              <Box marginTop={1} marginBottom={1}>
                <Text>Contacts</Text>
              </Box>
              {currentIdentity.contacts.emails.length > 0 && (
                <Box marginLeft={2}>
                  <Text>{`Email: ${currentIdentity.contacts.emails[0].value}`}</Text>
                </Box>
              )}
              {currentIdentity.contacts.phones.length > 0 && (
                <Box marginLeft={2}>
                  <Text>{`Phone: ${currentIdentity.contacts.phones[0].value}`}</Text>
                </Box>
              )}
              {currentIdentity.contacts.addresses.length > 0 && (
                <Box marginLeft={2}>
                  <Text>
                    {`Address: ${[
                      currentIdentity.contacts.addresses[0].street,
                      currentIdentity.contacts.addresses[0].city,
                      currentIdentity.contacts.addresses[0].state,
                      currentIdentity.contacts.addresses[0].postalCode,
                      currentIdentity.contacts.addresses[0].country,
                    ].filter(Boolean).join(', ')}`}
                  </Text>
                </Box>
              )}
              {currentIdentity.contacts.virtualAddresses && currentIdentity.contacts.virtualAddresses.length > 0 && (
                <Box marginLeft={2}>
                  <Text>{`Virtual: ${currentIdentity.contacts.virtualAddresses[0].value}`}</Text>
                </Box>
              )}
            </>
          )}

          {currentIdentity.context && (
            <>
              <Box marginTop={1} marginBottom={1}>
                <Text>Context</Text>
              </Box>
              <Box marginLeft={2}>
                <Text fg={themeColor('muted')}>{currentIdentity.context.slice(0, 200)}{currentIdentity.context.length > 200 ? '...' : ''}</Text>
              </Box>
            </>
          )}
        </Box>

        {error && (
          <Box marginTop={1}>
            <Text fg={themeColor('error')}>{error}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text fg={themeColor('muted')}>
            {!isActive && 's switch | '}
            e edit |{' '}
            {!currentIdentity.isDefault && 'd set default | '}
            x delete | Esc back
          </Text>
        </Box>
      </Box>
    );
  }

  // List view (default)
  const visibleIdentities = identities.slice(identityRange.start, identityRange.end);

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box marginBottom={1}>
        <Text fg={themeColor('info')}>Identities{identities.length > MAX_VISIBLE_ITEMS ? ` (${identityIndex + 1}/${identities.length})` : ''}</Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={themeColor('border')} border={["top", "bottom"]}
        paddingX={1}
      >
        {identityRange.hasMore.above > 0 && (
          <Box paddingY={0}>
            <Text fg={themeColor('muted')}>  ↑ {identityRange.hasMore.above} more above</Text>
          </Box>
        )}

        {visibleIdentities.map((identity, visibleIdx) => {
          const actualIdx = identityRange.start + visibleIdx;
          const isSelected = actualIdx === identityIndex;
          const isActive = identity.id === activeIdentityId;
          const prefix = isSelected ? '> ' : '  ';
          const nameDisplay = identity.name.padEnd(20);
          const statusIcon = identity.isDefault ? '★' : isActive ? '●' : '○';

          return (
            <Box key={identity.id} paddingY={0}>
              <Text bg={isSelected ? themeColor('primary') : undefined} fg={isSelected ? themeColor('text') : "gray"}>
                {`${prefix}${statusIcon} ${nameDisplay} ${identity.profile.displayName}`}
              </Text>
            </Box>
          );
        })}

        {identityRange.hasMore.below > 0 && (
          <Box paddingY={0}>
            <Text fg={themeColor('muted')}>  ↓ {identityRange.hasMore.below} more below</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>Legend: ★ default | ● active | ○ inactive</Text>
      </Box>

      <Box marginTop={1}>
        <Text fg={themeColor('muted')}>
          ↑↓ select | Enter view | n new | q quit
        </Text>
      </Box>
    </Box>
  );
}
