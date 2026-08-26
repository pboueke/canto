export type LangCode =
  | 'en'
  | 'pt'
  | 'es'
  | 'de'
  | 'fr'
  | 'ru'
  | 'zh'
  | 'it'
  | 'ja'
  | 'ko'
  | 'ar'
  | 'hi'
  | 'tr'
  | 'nl'
  | 'pl'
  | 'sv'
  | 'vi'
  | 'th'
  | 'id'
  | 'uk';

export interface Dictionary {
  app: {
    name: string;
    tagline: string;
  };
  common: {
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    create: string;
    open: string;
    close: string;
    search: string;
    settings: string;
    loading: string;
    confirm: string;
    done: string;
    skip: string;
  };
  home: {
    title: string;
    newJournal: string;
    noJournals: string;
    journalName: string;
    selectIcon: string;
    password: string;
    confirmPassword: string;
    passwordMismatch: string;
    passwordOptional: string;
    wrongPassword: string;
    unlockJournal: string;
    passwordTooShort: string;
    tooManyAttempts: string;
    passwordWarning: string;
    biometricLock: string;
    biometricReason: string;
    biometricUnavailable: string;
    passwordExplainTitle: string;
    passwordExplainBody: string;
    decrypting: string;
  };
  journal: {
    title: string;
    newPage: string;
    noPages: string;
    filter: string;
    sort: string;
    anniversary: string;
  };
  calendar: {
    titleSuffix: string;
    anniversaryRow: string;
    anniversaryRowOne: string;
    anniversaryRowZero: string;
    noPages: string;
  };
  page: {
    title: string;
    placeholder: string;
    tags: string;
    attachments: string;
    comments: string;
    location: string;
    addImage: string;
    addEncryptedImage: string;
    addFile: string;
    addEncryptedFile: string;
    addLocation: string;
    addComment: string;
    addTag: string;
    newTag: string;
    noComments: string;
    discardChanges: string;
    discardMessage: string;
    discard: string;
    keep: string;
    deleteConfirm: string;
    deleteMessage: string;
    locationCopied: string;
    decrypting: string;
    takePhoto: string;
    takeEncryptedPhoto: string;
    cameraPermissionDenied: string;
  };
  settings: {
    theme: string;
    language: string;
    darkMode: string;
    lightMode: string;
    appearance: string;
    fontSize: string;
    fontFamily: string;
    fontSizeSmall: string;
    fontSizeDefault: string;
    fontSizeLarge: string;
    fontSizeXLarge: string;
    fontFamilyDefault: string;
    fontFamilyDyslexic: string;
    fontFamilySerif: string;
  };
  passwordStrength: {
    weak: string;
    fair: string;
    strong: string;
    min8: string;
    min12: string;
    lowercase: string;
    uppercase: string;
    digit: string;
    special: string;
  };
  journalSettings: {
    title: string;
    stats: string;
    pageCount: string;
    createdOn: string;
    displaySettings: string;
    use24h: string;
    previewTags: string;
    previewThumbnail: string;
    previewIcons: string;
    filterBarToggle: string;
    autoLocation: string;
    sortOrder: string;
    ascending: string;
    descending: string;
    none: string;
    changeIcon: string;
    changeName: string;
    newName: string;
    changePassword: string;
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
    removePassword: string;
    removePasswordHint: string;
    passwordChanged: string;
    passwordRemoved: string;
    passwordAdded: string;
    passwordProtectionUpdatedWithExceptions: string;
    passwordProtectionExceptionDescription: string;
    dangerZone: string;
    deleteJournal: string;
    deleteConfirmSecure: string;
    typeToDelete: string;
    reencrypting: string;
    reencryptProgress: string;
    themeOverride: string;
    useGlobalTheme: string;
  };
  filterBar: {
    searchPlaceholder: string;
    from: string;
    to: string;
    clearFilters: string;
    hasImage: string;
    hasFile: string;
    hasLocation: string;
    tags: string;
    filterBy: string;
    noTagsAvailable: string;
  };
  security: {
    title: string;
    keyStrength: string;
    kdfHint: string;
    kdfExplainTitle: string;
    kdfExplainBody: string;
    kdf: {
      fast: string;
      improved: string;
      moderate: string;
      strong: string;
      great: string;
      extreme: string;
    };
    autoLock: string;
    autoLockOff: string;
    autoLock1m: string;
    autoLock5m: string;
    autoLock15m: string;
    autoLockTitle: string;
    autoLockMessage: string;
    rotateDeviceKey: string;
    rotateExplain: string;
    rotateWarning: string;
    rotateConfirm: string;
    rotating: string;
    rotateSuccess: string;
    doNotClose: string;
  };
  backup: {
    export: string;
    import: string;
    exportJournal: string;
    importFromBackup: string;
    includeEncryption: string;
    exporting: string;
    exportComplete: string;
    exportError: string;
    importPassword: string;
    importConflict: string;
    importRename: string;
    importSuccess: string;
    importError: string;
    invalidFile: string;
    importing: string;
    or: string;
  };
  onboarding: {
    welcomeTitle: string;
    welcomeSubtitle: string;
    encryptionTitle: string;
    encryptionBody: string;
    privacyTitle: string;
    privacyBody: string;
    getStartedTitle: string;
    getStartedBody: string;
    getStartedButton: string;
    next: string;
    stepOf: string;
  };
  sync: {
    sync: string;
    syncNow: string;
    syncing: string;
    syncComplete: string;
    syncCheckpointed: string;
    syncDeferredAttachments: string;
    syncDeferredChunkGeneration: string;
    syncDeferredAttachmentNotFound: string;
    syncError: string;
    passwordChangedElsewhere: string;
    enableGDriveSync: string;
    disableSync: string;
    autoSync: string;
    lastSynced: string;
    neverSynced: string;
    notConfigured: string;
    signInToGoogle: string;
    signedInAs: string;
    signOut: string;
    importFromCloud: string;
    noCloudJournals: string;
    preparingImport: string;
    journalAlreadyLocal: string;
    connectAccount: string;
    account: string;
    manageJournals: string;
    deleteRemoteJournal: string;
    deleteRemoteConfirm: string;
    deleteRemoteSuccess: string;
    selectProvider: string;
    googleDrive: string;
    loggedInWith: string;
    sessionRetention: string;
    retentionOneDay: string;
    retentionOneWeek: string;
    retentionOneMonth: string;
    retentionNever: string;
  };
  a11y: {
    imageNofM: string;
    deleteImage: string;
    moveLeft: string;
    moveRight: string;
    downloadImage: string;
    searchPages: string;
    clearSearch: string;
    filterButton: string;
    fileAttachment: string;
    deleteFile: string;
    pageEntry: string;
  };
  help: {
    title: string;
    body: string;
    linkText: string;
  };
  changelog: {
    title: string;
    dependenciesTab: string;
  };
  dataIntegrity: {
    syncWarningTitle: string;
    syncWarningDesc: string;
    syncSuggestion: string;
    keepPartial: string;
    importWarningTitle: string;
    importWarningDesc: string;
    importSuggestion: string;
    failedItems: string;
    retry: string;
    acknowledge: string;
  };
}

const en: Dictionary = {
  app: {
    name: 'Canto',
    tagline: 'Your private journal',
  },
  common: {
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    open: 'Open',
    close: 'Close',
    search: 'Search',
    settings: 'Settings',
    loading: 'Loading...',
    confirm: 'Confirm',
    done: 'Done',
    skip: 'Skip',
  },
  home: {
    title: 'Journals',
    newJournal: 'New Journal',
    noJournals: 'No journals yet. Create one to get started!',
    journalName: 'Journal name',
    selectIcon: 'Select icon',
    password: 'Password',
    confirmPassword: 'Confirm password',
    passwordMismatch: 'Passwords do not match',
    passwordOptional: 'Optional',
    wrongPassword: 'Wrong password',
    unlockJournal: 'Unlock Journal',
    passwordTooShort: 'Password must be at least 8 characters',
    tooManyAttempts: 'Too many attempts. Try again later.',
    passwordWarning:
      'There is no password recovery. If you forget your password, your data will be permanently lost.',
    biometricLock: 'Biometric unlock',
    biometricReason: 'Authenticate to unlock journal',
    biometricUnavailable: 'Biometric authentication is not available on this device',
    passwordExplainTitle: 'How does Canto protect your data?',
    passwordExplainBody:
      "All your journals are always encrypted on this device using a unique device key stored in secure hardware.\n\nAdding a password provides an extra layer of encryption on top of the device key. This means that even if someone gains access to your device files, they cannot read your journal without the password.\n\nIf you choose not to set a password, your data is still encrypted with the device key — it just won't require a password to open.",
    decrypting: 'Decrypting...',
  },
  journal: {
    title: 'Pages',
    newPage: 'New Page',
    noPages: 'No pages yet. Create your first entry!',
    filter: 'Filter',
    sort: 'Sort',
    anniversary: 'Anniversary',
  },
  calendar: {
    titleSuffix: 'Calendar',
    anniversaryRow: '{count} pages celebrating an anniversary today',
    anniversaryRowOne: '1 page celebrating an anniversary today',
    anniversaryRowZero: 'No anniversaries today',
    noPages: 'No pages yet',
  },
  page: {
    title: 'Page',
    placeholder: 'Start writing...',
    tags: 'Tags',
    attachments: 'Attachments',
    comments: 'Comments',
    location: 'Location',
    addImage: 'Image',
    addEncryptedImage: 'Encrypted Image',
    addFile: 'File',
    addEncryptedFile: 'Encrypted File',
    addLocation: 'Location',
    addComment: 'Add comment',
    addTag: 'Add tag',
    newTag: 'New tag...',
    noComments: 'No comments yet',
    discardChanges: 'Discard changes?',
    discardMessage: 'You have unsaved changes. Discard them?',
    discard: 'Discard',
    keep: 'Keep editing',
    deleteConfirm: 'Delete entry?',
    deleteMessage: 'This entry will be permanently deleted.',
    locationCopied: 'Coordinates copied',
    decrypting: 'Decrypting...',
    takePhoto: 'Take Photo',
    takeEncryptedPhoto: 'Encrypted Photo',
    cameraPermissionDenied: 'Camera permission denied',
  },
  settings: {
    theme: 'Theme',
    language: 'Language',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    appearance: 'Appearance',
    fontSize: 'Font size',
    fontFamily: 'Font family',
    fontSizeSmall: 'Small',
    fontSizeDefault: 'Default',
    fontSizeLarge: 'Large',
    fontSizeXLarge: 'Extra large',
    fontFamilyDefault: 'Default',
    fontFamilyDyslexic: 'OpenDyslexic',
    fontFamilySerif: 'Serif',
  },
  passwordStrength: {
    weak: 'Weak',
    fair: 'Fair',
    strong: 'Strong',
    min8: '8+ characters',
    min12: '12+ characters',
    lowercase: 'lowercase letter',
    uppercase: 'uppercase letter',
    digit: 'number',
    special: 'special character',
  },
  journalSettings: {
    title: 'Journal Settings',
    stats: 'Statistics',
    pageCount: 'Pages created',
    createdOn: 'Created on',
    displaySettings: 'Display',
    use24h: '24-hour time',
    previewTags: 'Show tags in preview',
    previewThumbnail: 'Show thumbnail in preview',
    previewIcons: 'Show content icons in preview',
    filterBarToggle: 'Show filter bar',
    autoLocation: 'Auto-add location',
    sortOrder: 'Sort order',
    ascending: 'Oldest first',
    descending: 'Newest first',
    none: 'No sorting',
    changeIcon: 'Change icon',
    changeName: 'Change name',
    newName: 'New name',
    changePassword: 'Change password',
    currentPassword: 'Current password',
    newPassword: 'New password',
    confirmNewPassword: 'Confirm new password',
    removePassword: 'Remove password',
    removePasswordHint: 'Leave blank to remove password protection',
    passwordChanged: 'Password changed successfully',
    passwordRemoved: 'Password protection removed',
    passwordAdded: 'Password protection added',
    passwordProtectionUpdatedWithExceptions: 'Password protection updated with exceptions',
    passwordProtectionExceptionDescription:
      'The following files remain device-encrypted but are not protected by this journal password. They may also be unprotected in synced backups:',
    dangerZone: 'Danger zone',
    deleteJournal: 'Delete journal',
    deleteConfirmSecure: 'Enter your password to delete this journal',
    typeToDelete: "Type 'delete {name}' to confirm",
    reencrypting: 'Re-encrypting data...',
    reencryptProgress: 'Processing {current} of {total}...',
    themeOverride: 'Theme',
    useGlobalTheme: 'Use global theme',
  },
  filterBar: {
    searchPlaceholder: 'Search...',
    from: 'From',
    to: 'To',
    clearFilters: 'Clear',
    hasImage: 'Images',
    hasFile: 'Files',
    hasLocation: 'Location',
    tags: 'Tags',
    filterBy: 'Filter by',
    noTagsAvailable: 'No tags in this journal',
  },
  security: {
    title: 'Security',
    keyStrength: 'Key strength',
    kdfHint: 'Higher iterations are slower to unlock but harder to crack',
    kdfExplainTitle: 'What is key strength?',
    kdfExplainBody:
      'When you set a password, your journal is encrypted using a key derived from it. Key strength controls how many iterations of the PBKDF2 algorithm are used to derive this key.\n\nMore iterations make the key significantly harder to crack by brute force, but also make unlocking your journal slower — especially on older devices.\n\nAvailable levels:\n• Fast — 50,000 iterations\n• Improved — 100,000 iterations\n• Moderate — 200,000 iterations\n• Strong — 600,000 iterations\n• Great — 800,000 iterations\n• Extreme — 1,000,000 iterations\n\nFor most users, "Fast" is sufficient. Choose a higher setting if you prioritize security over unlock speed.',
    kdf: {
      fast: 'Fast',
      improved: 'Improved',
      moderate: 'Moderate',
      strong: 'Strong',
      great: 'Great',
      extreme: 'Extreme',
    },
    autoLock: 'Auto-lock',
    autoLockOff: 'Off',
    autoLock1m: '1 minute',
    autoLock5m: '5 minutes',
    autoLock15m: '15 minutes',
    autoLockTitle: 'Session Locked',
    autoLockMessage:
      'Your session was locked due to inactivity. You will be redirected to the home screen.',
    rotateDeviceKey: 'Rotate device key',
    rotateExplain:
      'Your data is encrypted with a unique key stored securely on this device. Rotating the key generates a new one and re-encrypts all journals, pages and attachments. This is recommended if you suspect your device was compromised. The process may take a few seconds to several minutes depending on how much data you have.',
    rotateWarning:
      'All journals, pages and attachments will be re-encrypted with a new key. This may take a few minutes for large journals. Do not close the app until the process completes — interruption could leave data in a mixed state.',
    rotateConfirm: 'Rotate key',
    rotating: 'Rotating device key...',
    rotateSuccess: 'Device key rotated successfully',
    doNotClose: 'Do not close the app',
  },
  backup: {
    export: 'Export',
    import: 'Import',
    exportJournal: 'Export Journal',
    importFromBackup: 'Import from Backup',
    includeEncryption: 'Include encryption',
    exporting: 'Exporting...',
    exportComplete: 'Export ready',
    exportError: 'Export failed',
    importPassword: 'This backup is encrypted. Enter the password:',
    importConflict: 'A journal with this name already exists',
    importRename: 'Rename journal',
    importSuccess: 'Journal imported successfully',
    importError: 'Import failed',
    invalidFile: 'Invalid backup file',
    importing: 'Importing...',
    or: 'OR',
  },
  sync: {
    sync: 'Sync',
    syncNow: 'Sync now',
    syncing: 'Syncing...',
    syncComplete: 'Sync complete',
    syncCheckpointed:
      'Sync paused to protect memory. Fully close this tab, reopen Canto, then sync again.',
    syncDeferredAttachments: 'Some large legacy attachments were not synced',
    syncDeferredChunkGeneration: 'Attachment uses an older chunk format and was not synced',
    syncDeferredAttachmentNotFound: 'Attachment was not found in cloud storage',
    syncError: 'Sync failed',
    passwordChangedElsewhere:
      'The password was changed on another device. Save any unsynced local changes elsewhere, remove this local journal, then re-import it from Google Drive using the new password.',
    enableGDriveSync: 'Enable Google Drive sync',
    disableSync: 'Disable sync',
    autoSync: 'Auto-sync',
    lastSynced: 'Last synced',
    neverSynced: 'Never synced',
    notConfigured: 'Not configured',
    signInToGoogle: 'Sign in to Google',
    signedInAs: 'Signed in as',
    signOut: 'Sign out',
    importFromCloud: 'Import from Google Drive',
    noCloudJournals: 'No journals found on Google Drive',
    preparingImport: 'Preparing import...',
    journalAlreadyLocal: 'Already on this device',
    connectAccount: 'Connect account',
    account: 'Account',
    manageJournals: 'Manage journals',
    deleteRemoteJournal: 'Delete from cloud',
    deleteRemoteConfirm:
      'This will permanently delete this journal from Google Drive. Local copies will not be affected. This action cannot be undone.',
    deleteRemoteSuccess: 'Journal deleted from cloud',
    selectProvider: 'Select sync provider',
    googleDrive: 'Google Drive',
    loggedInWith: 'Logged in with {provider}',
    sessionRetention: 'Session retention',
    retentionOneDay: '1 day',
    retentionOneWeek: '1 week',
    retentionOneMonth: '1 month',
    retentionNever: 'Never expire',
  },
  onboarding: {
    welcomeTitle: 'Welcome to Canto',
    welcomeSubtitle: 'Your private, encrypted journal.',
    encryptionTitle: 'Your entries are encrypted',
    encryptionBody:
      'Canto uses AES-256 encryption. Your data is encrypted on your device before it goes anywhere.',
    privacyTitle: 'No tracking. No ads.\nNo data collection.',
    privacyBody:
      'Canto is open source. Your journal never leaves your device unless you choose to sync it yourself.',
    getStartedTitle: 'Start writing.',
    getStartedBody: 'Create your first journal and start journaling privately.',
    getStartedButton: 'Get started',
    next: 'Next',
    stepOf: '{step} of {total}',
  },
  a11y: {
    imageNofM: 'Image {n} of {m}',
    deleteImage: 'Delete image',
    moveLeft: 'Move left',
    moveRight: 'Move right',
    downloadImage: 'Download image',
    searchPages: 'Search pages',
    clearSearch: 'Clear search',
    filterButton: 'Filter',
    fileAttachment: 'File attachment',
    deleteFile: 'Delete file',
    pageEntry: 'Page entry',
  },
  help: {
    title: 'Help',
    body: 'If you need help or want to report a bug, please visit the Canto project page on GitHub.',
    linkText: 'Open GitHub Issues',
  },
  changelog: {
    title: 'Changelog',
    dependenciesTab: 'Dependencies',
  },
  dataIntegrity: {
    syncWarningTitle: 'Sync Warning',
    syncWarningDesc: '{failed} of {total} pages could not be downloaded.',
    syncSuggestion:
      'Check your internet connection and try again. You can also keep the partial import and re-sync later.',
    keepPartial: 'Keep Partial',
    importWarningTitle: 'Import Warning',
    importWarningDesc: '{count} attachment(s) could not be saved during import.',
    importSuggestion:
      'The journal was imported but some attachments are missing. Try importing again from the same backup file to recover them.',
    failedItems: 'Failed items',
    retry: 'Retry',
    acknowledge: 'OK',
  },
};

const pt: Dictionary = {
  app: {
    name: 'Canto',
    tagline: 'Seu diário privado',
  },
  common: {
    cancel: 'Cancelar',
    save: 'Salvar',
    delete: 'Excluir',
    edit: 'Editar',
    create: 'Criar',
    open: 'Abrir',
    close: 'Fechar',
    search: 'Buscar',
    settings: 'Configurações',
    loading: 'Carregando...',
    confirm: 'Confirmar',
    done: 'Pronto',
    skip: 'Pular',
  },
  home: {
    title: 'Diários',
    newJournal: 'Novo Diário',
    noJournals: 'Nenhum diário ainda. Crie um para começar!',
    journalName: 'Nome do diário',
    selectIcon: 'Selecionar ícone',
    password: 'Senha',
    confirmPassword: 'Confirmar senha',
    passwordMismatch: 'As senhas não coincidem',
    passwordOptional: 'Opcional',
    wrongPassword: 'Senha incorreta',
    unlockJournal: 'Desbloquear Diário',
    passwordTooShort: 'A senha deve ter pelo menos 8 caracteres',
    tooManyAttempts: 'Muitas tentativas. Tente novamente mais tarde.',
    passwordWarning:
      'Não há recuperação de senha. Se você esquecer sua senha, seus dados serão permanentemente perdidos.',
    biometricLock: 'Desbloqueio biométrico',
    biometricReason: 'Autentique-se para desbloquear o diário',
    biometricUnavailable: 'Autenticação biométrica não está disponível neste dispositivo',
    passwordExplainTitle: 'Como o Canto protege seus dados?',
    passwordExplainBody:
      'Todos os seus diários são sempre criptografados neste dispositivo usando uma chave única armazenada em hardware seguro.\n\nAdicionar uma senha fornece uma camada extra de criptografia sobre a chave do dispositivo. Isso significa que, mesmo que alguém acesse os arquivos do seu dispositivo, não poderá ler seu diário sem a senha.\n\nSe você optar por não definir uma senha, seus dados ainda estarão criptografados com a chave do dispositivo — apenas não exigirão uma senha para abrir.',
    decrypting: 'Descriptografando...',
  },
  journal: {
    title: 'Páginas',
    newPage: 'Nova Página',
    noPages: 'Nenhuma página ainda. Crie sua primeira entrada!',
    filter: 'Filtrar',
    sort: 'Ordenar',
    anniversary: 'Aniversário',
  },
  calendar: {
    titleSuffix: 'Calendário',
    anniversaryRow: '{count} páginas celebrando um aniversário hoje',
    anniversaryRowOne: '1 página celebrando um aniversário hoje',
    anniversaryRowZero: 'Sem aniversários hoje',
    noPages: 'Ainda não há páginas',
  },
  page: {
    title: 'Página',
    placeholder: 'Comece a escrever...',
    tags: 'Tags',
    attachments: 'Anexos',
    comments: 'Comentários',
    location: 'Localização',
    addImage: 'Imagem',
    addEncryptedImage: 'Imagem Criptografada',
    addFile: 'Arquivo',
    addEncryptedFile: 'Arquivo Criptografado',
    addLocation: 'Localização',
    addComment: 'Adicionar comentário',
    addTag: 'Adicionar tag',
    newTag: 'Nova tag...',
    noComments: 'Sem comentários ainda',
    discardChanges: 'Descartar alterações?',
    discardMessage: 'Você tem alterações não salvas. Descartar?',
    discard: 'Descartar',
    keep: 'Continuar editando',
    deleteConfirm: 'Excluir entrada?',
    deleteMessage: 'Esta entrada será excluída permanentemente.',
    locationCopied: 'Coordenadas copiadas',
    decrypting: 'Descriptografando...',
    takePhoto: 'Tirar Foto',
    takeEncryptedPhoto: 'Foto Criptografada',
    cameraPermissionDenied: 'Permissão de câmera negada',
  },
  settings: {
    theme: 'Tema',
    language: 'Idioma',
    darkMode: 'Modo Escuro',
    lightMode: 'Modo Claro',
    appearance: 'Aparência',
    fontSize: 'Tamanho da fonte',
    fontFamily: 'Família da fonte',
    fontSizeSmall: 'Pequeno',
    fontSizeDefault: 'Padrão',
    fontSizeLarge: 'Grande',
    fontSizeXLarge: 'Extra grande',
    fontFamilyDefault: 'Padrão',
    fontFamilyDyslexic: 'OpenDyslexic',
    fontFamilySerif: 'Serifa',
  },
  passwordStrength: {
    weak: 'Fraca',
    fair: 'Razoável',
    strong: 'Forte',
    min8: '8+ caracteres',
    min12: '12+ caracteres',
    lowercase: 'letra minúscula',
    uppercase: 'letra maiúscula',
    digit: 'número',
    special: 'caractere especial',
  },
  journalSettings: {
    title: 'Configurações do Diário',
    stats: 'Estatísticas',
    pageCount: 'Páginas criadas',
    createdOn: 'Criado em',
    displaySettings: 'Exibição',
    use24h: 'Horário 24 horas',
    previewTags: 'Mostrar tags na prévia',
    previewThumbnail: 'Mostrar miniatura na prévia',
    previewIcons: 'Mostrar ícones de conteúdo na prévia',
    filterBarToggle: 'Mostrar barra de filtros',
    autoLocation: 'Adicionar localização automaticamente',
    sortOrder: 'Ordem de classificação',
    ascending: 'Mais antigos primeiro',
    descending: 'Mais recentes primeiro',
    none: 'Sem ordenação',
    changeIcon: 'Alterar ícone',
    changeName: 'Alterar nome',
    newName: 'Novo nome',
    changePassword: 'Alterar senha',
    currentPassword: 'Senha atual',
    newPassword: 'Nova senha',
    confirmNewPassword: 'Confirmar nova senha',
    removePassword: 'Remover senha',
    removePasswordHint: 'Deixe em branco para remover a proteção por senha',
    passwordChanged: 'Senha alterada com sucesso',
    passwordRemoved: 'Proteção por senha removida',
    passwordAdded: 'Proteção por senha adicionada',
    passwordProtectionUpdatedWithExceptions: 'Proteção por senha atualizada com exceções',
    passwordProtectionExceptionDescription:
      'Os seguintes arquivos permanecem criptografados no dispositivo, mas não são protegidos por esta senha do diário. Eles também podem ficar desprotegidos em backups sincronizados:',
    dangerZone: 'Zona de perigo',
    deleteJournal: 'Excluir diário',
    deleteConfirmSecure: 'Digite sua senha para excluir este diário',
    typeToDelete: "Digite 'delete {name}' para confirmar",
    reencrypting: 'Re-criptografando dados...',
    reencryptProgress: 'Processando {current} de {total}...',
    themeOverride: 'Tema',
    useGlobalTheme: 'Usar tema global',
  },
  filterBar: {
    searchPlaceholder: 'Buscar...',
    from: 'De',
    to: 'Até',
    clearFilters: 'Limpar',
    hasImage: 'Imagens',
    hasFile: 'Arquivos',
    hasLocation: 'Localização',
    tags: 'Tags',
    filterBy: 'Filtrar por',
    noTagsAvailable: 'Nenhuma tag neste diário',
  },
  security: {
    title: 'Segurança',
    keyStrength: 'Força da chave',
    kdfHint: 'Mais iterações tornam o desbloqueio mais lento, mas mais seguro',
    kdfExplainTitle: 'O que é força da chave?',
    kdfExplainBody:
      'Quando você define uma senha, seu diário é criptografado usando uma chave derivada dela. A força da chave controla quantas iterações do algoritmo PBKDF2 são usadas para derivar essa chave.\n\nMais iterações tornam a chave significativamente mais difícil de quebrar por força bruta, mas também tornam o desbloqueio mais lento — especialmente em dispositivos mais antigos.\n\nNíveis disponíveis:\n• Rápido — 50.000 iterações\n• Aprimorado — 100.000 iterações\n• Moderado — 200.000 iterações\n• Forte — 600.000 iterações\n• Ótimo — 800.000 iterações\n• Extremo — 1.000.000 iterações\n\nPara a maioria dos usuários, "Rápido" é suficiente. Escolha um nível mais alto se você prioriza segurança sobre velocidade.',
    kdf: {
      fast: 'Rápido',
      improved: 'Aprimorado',
      moderate: 'Moderado',
      strong: 'Forte',
      great: 'Ótimo',
      extreme: 'Extremo',
    },
    autoLock: 'Bloqueio automático',
    autoLockOff: 'Desligado',
    autoLock1m: '1 minuto',
    autoLock5m: '5 minutos',
    autoLock15m: '15 minutos',
    autoLockTitle: 'Sessão Bloqueada',
    autoLockMessage:
      'Sua sessão foi bloqueada por inatividade. Você será redirecionado para a tela inicial.',
    rotateDeviceKey: 'Rotacionar chave do dispositivo',
    rotateExplain:
      'Seus dados são criptografados com uma chave única armazenada com segurança neste dispositivo. Rotacionar a chave gera uma nova e re-criptografa todos os diários, páginas e anexos. Recomendado se você suspeitar que seu dispositivo foi comprometido. O processo pode levar de alguns segundos a vários minutos dependendo da quantidade de dados.',
    rotateWarning:
      'Todos os diários, páginas e anexos serão re-criptografados com uma nova chave. Pode levar alguns minutos para diários grandes. Não feche o app até o processo terminar — interrupção pode deixar dados em estado misto.',
    rotateConfirm: 'Rotacionar chave',
    rotating: 'Rotacionando chave do dispositivo...',
    rotateSuccess: 'Chave do dispositivo rotacionada com sucesso',
    doNotClose: 'Não feche o aplicativo',
  },
  backup: {
    export: 'Exportar',
    import: 'Importar',
    exportJournal: 'Exportar Diário',
    importFromBackup: 'Importar de Backup',
    includeEncryption: 'Incluir criptografia',
    exporting: 'Exportando...',
    exportComplete: 'Exportação pronta',
    exportError: 'Falha na exportação',
    importPassword: 'Este backup está criptografado. Digite a senha:',
    importConflict: 'Um diário com este nome já existe',
    importRename: 'Renomear diário',
    importSuccess: 'Diário importado com sucesso',
    importError: 'Falha na importação',
    invalidFile: 'Arquivo de backup inválido',
    importing: 'Importando...',
    or: 'OU',
  },
  sync: {
    sync: 'Sincronizar',
    syncNow: 'Sincronizar agora',
    syncing: 'Sincronizando...',
    syncComplete: 'Sincronização concluída',
    syncCheckpointed:
      'Sincronização pausada para proteger a memória. Feche completamente esta aba, reabra o Canto e sincronize novamente.',
    syncDeferredAttachments: 'Alguns anexos grandes antigos não foram sincronizados',
    syncDeferredChunkGeneration: 'O anexo usa um formato de bloco antigo e não foi sincronizado',
    syncDeferredAttachmentNotFound: 'O anexo não foi encontrado no armazenamento em nuvem',
    syncError: 'Falha na sincronização',
    passwordChangedElsewhere:
      'A senha foi alterada em outro dispositivo. Salve separadamente quaisquer alterações locais não sincronizadas, remova este diário deste dispositivo e importe-o novamente do Google Drive usando a nova senha.',
    enableGDriveSync: 'Ativar sincronização com Google Drive',
    disableSync: 'Desativar sincronização',
    autoSync: 'Sincronização automática',
    lastSynced: 'Última sincronização',
    neverSynced: 'Nunca sincronizado',
    notConfigured: 'Não configurado',
    signInToGoogle: 'Entrar com Google',
    signedInAs: 'Conectado como',
    signOut: 'Sair',
    importFromCloud: 'Importar do Google Drive',
    noCloudJournals: 'Nenhum diário encontrado no Google Drive',
    preparingImport: 'Preparando importação...',
    journalAlreadyLocal: 'Já está neste dispositivo',
    connectAccount: 'Conectar conta',
    account: 'Conta',
    manageJournals: 'Gerenciar diários',
    deleteRemoteJournal: 'Excluir da nuvem',
    deleteRemoteConfirm:
      'Isso excluirá permanentemente este diário do Google Drive. Cópias locais não serão afetadas. Esta ação não pode ser desfeita.',
    deleteRemoteSuccess: 'Diário excluído da nuvem',
    selectProvider: 'Selecionar provedor de sincronização',
    googleDrive: 'Google Drive',
    loggedInWith: 'Conectado com {provider}',
    sessionRetention: 'Retenção da sessão',
    retentionOneDay: '1 dia',
    retentionOneWeek: '1 semana',
    retentionOneMonth: '1 mês',
    retentionNever: 'Nunca expirar',
  },
  onboarding: {
    welcomeTitle: 'Bem-vindo ao Canto',
    welcomeSubtitle: 'Seu diário privado e criptografado.',
    encryptionTitle: 'Suas entradas são criptografadas',
    encryptionBody:
      'O Canto usa criptografia AES-256. Seus dados são criptografados no seu dispositivo antes de ir a qualquer lugar.',
    privacyTitle: 'Sem rastreamento. Sem anúncios.\nSem coleta de dados.',
    privacyBody:
      'O Canto é código aberto. Seu diário nunca sai do seu dispositivo a menos que você escolha sincronizá-lo.',
    getStartedTitle: 'Comece a escrever.',
    getStartedBody: 'Crie seu primeiro diário e comece a escrever com privacidade.',
    getStartedButton: 'Começar',
    next: 'Próximo',
    stepOf: '{step} de {total}',
  },
  a11y: {
    imageNofM: 'Imagem {n} de {m}',
    deleteImage: 'Excluir imagem',
    moveLeft: 'Mover para a esquerda',
    moveRight: 'Mover para a direita',
    downloadImage: 'Baixar imagem',
    searchPages: 'Pesquisar páginas',
    clearSearch: 'Limpar pesquisa',
    filterButton: 'Filtrar',
    fileAttachment: 'Anexo de arquivo',
    deleteFile: 'Excluir arquivo',
    pageEntry: 'Entrada da página',
  },
  help: {
    title: 'Ajuda',
    body: 'Se você precisa de ajuda ou deseja relatar um erro, visite a página do projeto Canto no GitHub.',
    linkText: 'Abrir GitHub Issues',
  },
  changelog: {
    title: 'Changelog',
    dependenciesTab: 'Dependências',
  },
  dataIntegrity: {
    syncWarningTitle: 'Aviso de Sincronização',
    syncWarningDesc: '{failed} de {total} páginas não puderam ser baixadas.',
    syncSuggestion:
      'Verifique sua conexão com a internet e tente novamente. Você também pode manter a importação parcial e sincronizar novamente depois.',
    keepPartial: 'Manter Parcial',
    importWarningTitle: 'Aviso de Importação',
    importWarningDesc: '{count} anexo(s) não puderam ser salvos durante a importação.',
    importSuggestion:
      'O diário foi importado, mas alguns anexos estão faltando. Tente importar novamente do mesmo arquivo de backup para recuperá-los.',
    failedItems: 'Itens com falha',
    retry: 'Tentar novamente',
    acknowledge: 'OK',
  },
};

const es: Dictionary = {
  app: {
    name: 'Canto',
    tagline: 'Tu diario privado',
  },
  common: {
    cancel: 'Cancelar',
    save: 'Guardar',
    delete: 'Eliminar',
    edit: 'Editar',
    create: 'Crear',
    open: 'Abrir',
    close: 'Cerrar',
    search: 'Buscar',
    settings: 'Configuración',
    loading: 'Cargando...',
    confirm: 'Confirmar',
    done: 'Listo',
    skip: 'Omitir',
  },
  home: {
    title: 'Diarios',
    newJournal: 'Nuevo Diario',
    noJournals: '¡Aún no hay diarios. Crea uno para empezar!',
    journalName: 'Nombre del diario',
    selectIcon: 'Seleccionar icono',
    password: 'Contraseña',
    confirmPassword: 'Confirmar contraseña',
    passwordMismatch: 'Las contraseñas no coinciden',
    passwordOptional: 'Opcional',
    wrongPassword: 'Contraseña incorrecta',
    unlockJournal: 'Desbloquear Diario',
    passwordTooShort: 'La contraseña debe tener al menos 8 caracteres',
    tooManyAttempts: 'Demasiados intentos. Intenta de nuevo más tarde.',
    passwordWarning:
      'No hay recuperación de contraseña. Si olvidas tu contraseña, tus datos se perderán permanentemente.',
    biometricLock: 'Desbloqueo biométrico',
    biometricReason: 'Autenticarse para desbloquear el diario',
    biometricUnavailable: 'La autenticación biométrica no está disponible en este dispositivo',
    passwordExplainTitle: '¿Cómo protege Canto tus datos?',
    passwordExplainBody:
      'Todos tus diarios están siempre cifrados en este dispositivo usando una clave única almacenada en hardware seguro.\n\nAñadir una contraseña proporciona una capa extra de cifrado sobre la clave del dispositivo. Esto significa que, incluso si alguien accede a los archivos de tu dispositivo, no podrá leer tu diario sin la contraseña.\n\nSi decides no establecer una contraseña, tus datos siguen cifrados con la clave del dispositivo — simplemente no requerirán una contraseña para abrirlos.',
    decrypting: 'Descifrando...',
  },
  journal: {
    title: 'Páginas',
    newPage: 'Nueva Página',
    noPages: '¡Aún no hay páginas. Crea tu primera entrada!',
    filter: 'Filtrar',
    sort: 'Ordenar',
    anniversary: 'Aniversario',
  },
  calendar: {
    titleSuffix: 'Calendario',
    anniversaryRow: '{count} páginas celebrando un aniversario hoy',
    anniversaryRowOne: '1 página celebrando un aniversario hoy',
    anniversaryRowZero: 'Sin aniversarios hoy',
    noPages: 'Aún no hay páginas',
  },
  page: {
    title: 'Página',
    placeholder: 'Empieza a escribir...',
    tags: 'Etiquetas',
    attachments: 'Adjuntos',
    comments: 'Comentarios',
    location: 'Ubicación',
    addImage: 'Imagen',
    addEncryptedImage: 'Imagen Cifrada',
    addFile: 'Archivo',
    addEncryptedFile: 'Archivo Cifrado',
    addLocation: 'Ubicación',
    addComment: 'Agregar comentario',
    addTag: 'Agregar etiqueta',
    newTag: 'Nueva etiqueta...',
    noComments: 'Sin comentarios aún',
    discardChanges: '¿Descartar cambios?',
    discardMessage: '¿Tienes cambios sin guardar? ¿Descartarlos?',
    discard: 'Descartar',
    keep: 'Seguir editando',
    deleteConfirm: '¿Eliminar entrada?',
    deleteMessage: 'Esta entrada se eliminará permanentemente.',
    locationCopied: 'Coordenadas copiadas',
    decrypting: 'Descifrando...',
    takePhoto: 'Tomar Foto',
    takeEncryptedPhoto: 'Foto Cifrada',
    cameraPermissionDenied: 'Permiso de cámara denegado',
  },
  settings: {
    theme: 'Tema',
    language: 'Idioma',
    darkMode: 'Modo Oscuro',
    lightMode: 'Modo Claro',
    appearance: 'Apariencia',
    fontSize: 'Tamaño de fuente',
    fontFamily: 'Familia de fuente',
    fontSizeSmall: 'Pequeño',
    fontSizeDefault: 'Predeterminado',
    fontSizeLarge: 'Grande',
    fontSizeXLarge: 'Extra grande',
    fontFamilyDefault: 'Predeterminado',
    fontFamilyDyslexic: 'OpenDyslexic',
    fontFamilySerif: 'Serif',
  },
  passwordStrength: {
    weak: 'Débil',
    fair: 'Aceptable',
    strong: 'Fuerte',
    min8: '8+ caracteres',
    min12: '12+ caracteres',
    lowercase: 'letra minúscula',
    uppercase: 'letra mayúscula',
    digit: 'número',
    special: 'carácter especial',
  },
  journalSettings: {
    title: 'Configuración del Diario',
    stats: 'Estadísticas',
    pageCount: 'Páginas creadas',
    createdOn: 'Creado el',
    displaySettings: 'Pantalla',
    use24h: 'Formato 24 horas',
    previewTags: 'Mostrar etiquetas en vista previa',
    previewThumbnail: 'Mostrar miniatura en vista previa',
    previewIcons: 'Mostrar iconos de contenido en vista previa',
    filterBarToggle: 'Mostrar barra de filtros',
    autoLocation: 'Agregar ubicación automáticamente',
    sortOrder: 'Orden de clasificación',
    ascending: 'Más antiguos primero',
    descending: 'Más recientes primero',
    none: 'Sin ordenar',
    changeIcon: 'Cambiar icono',
    changeName: 'Cambiar nombre',
    newName: 'Nuevo nombre',
    changePassword: 'Cambiar contraseña',
    currentPassword: 'Contraseña actual',
    newPassword: 'Nueva contraseña',
    confirmNewPassword: 'Confirmar nueva contraseña',
    removePassword: 'Eliminar contraseña',
    removePasswordHint: 'Dejar en blanco para eliminar la protección por contraseña',
    passwordChanged: 'Contraseña cambiada exitosamente',
    passwordRemoved: 'Protección por contraseña eliminada',
    passwordAdded: 'Protección por contraseña agregada',
    passwordProtectionUpdatedWithExceptions:
      'Protección con contraseña actualizada con excepciones',
    passwordProtectionExceptionDescription:
      'Los siguientes archivos permanecen cifrados en el dispositivo, pero no están protegidos por esta contraseña del diario. También pueden quedar desprotegidos en las copias de seguridad sincronizadas:',
    dangerZone: 'Zona de peligro',
    deleteJournal: 'Eliminar diario',
    deleteConfirmSecure: 'Ingresa tu contraseña para eliminar este diario',
    typeToDelete: "Escribe 'delete {name}' para confirmar",
    reencrypting: 'Re-cifrando datos...',
    reencryptProgress: 'Procesando {current} de {total}...',
    themeOverride: 'Tema',
    useGlobalTheme: 'Usar tema global',
  },
  filterBar: {
    searchPlaceholder: 'Buscar...',
    from: 'Desde',
    to: 'Hasta',
    clearFilters: 'Limpiar',
    hasImage: 'Imágenes',
    hasFile: 'Archivos',
    hasLocation: 'Ubicación',
    tags: 'Etiquetas',
    filterBy: 'Filtrar por',
    noTagsAvailable: 'No hay etiquetas en este diario',
  },
  security: {
    title: 'Seguridad',
    keyStrength: 'Fuerza de la clave',
    kdfHint: 'Más iteraciones hacen el desbloqueo más lento, pero más seguro',
    kdfExplainTitle: '¿Qué es la fuerza de la clave?',
    kdfExplainBody:
      'Cuando estableces una contraseña, tu diario se cifra usando una clave derivada de ella. La fuerza de la clave controla cuántas iteraciones del algoritmo PBKDF2 se usan para derivar esta clave.\n\nMás iteraciones hacen que la clave sea significativamente más difícil de descifrar por fuerza bruta, pero también hacen que el desbloqueo sea más lento.\n\nNiveles disponibles:\n• Rápido — 50.000 iteraciones\n• Mejorado — 100.000 iteraciones\n• Moderado — 200.000 iteraciones\n• Fuerte — 600.000 iteraciones\n• Excelente — 800.000 iteraciones\n• Extremo — 1.000.000 iteraciones\n\nPara la mayoría, "Rápido" es suficiente. Elige un nivel más alto si priorizas la seguridad.',
    kdf: {
      fast: 'Rápido',
      improved: 'Mejorado',
      moderate: 'Moderado',
      strong: 'Fuerte',
      great: 'Excelente',
      extreme: 'Extremo',
    },
    autoLock: 'Bloqueo automático',
    autoLockOff: 'Desactivado',
    autoLock1m: '1 minuto',
    autoLock5m: '5 minutos',
    autoLock15m: '15 minutos',
    autoLockTitle: 'Sesión Bloqueada',
    autoLockMessage:
      'Su sesión fue bloqueada por inactividad. Será redirigido a la pantalla principal.',
    rotateDeviceKey: 'Rotar clave del dispositivo',
    rotateExplain:
      'Sus datos están cifrados con una clave única almacenada de forma segura en este dispositivo. Rotar la clave genera una nueva y re-cifra todos los diarios, páginas y archivos adjuntos. Se recomienda si sospecha que su dispositivo fue comprometido. El proceso puede tardar desde unos segundos hasta varios minutos según la cantidad de datos.',
    rotateWarning:
      'Todos los diarios, páginas y archivos adjuntos serán re-cifrados con una nueva clave. Puede tardar varios minutos para diarios grandes. No cierre la app hasta que el proceso termine — la interrupción podría dejar datos en un estado mixto.',
    rotateConfirm: 'Rotar clave',
    rotating: 'Rotando clave del dispositivo...',
    rotateSuccess: 'Clave del dispositivo rotada exitosamente',
    doNotClose: 'No cierre la aplicación',
  },
  backup: {
    export: 'Exportar',
    import: 'Importar',
    exportJournal: 'Exportar Diario',
    importFromBackup: 'Importar desde Respaldo',
    includeEncryption: 'Incluir cifrado',
    exporting: 'Exportando...',
    exportComplete: 'Exportación lista',
    exportError: 'Error al exportar',
    importPassword: 'Este respaldo está cifrado. Ingrese la contraseña:',
    importConflict: 'Ya existe un diario con este nombre',
    importRename: 'Renombrar diario',
    importSuccess: 'Diario importado exitosamente',
    importError: 'Error al importar',
    invalidFile: 'Archivo de respaldo inválido',
    importing: 'Importando...',
    or: 'O',
  },
  sync: {
    sync: 'Sincronizar',
    syncNow: 'Sincronizar ahora',
    syncing: 'Sincronizando...',
    syncComplete: 'Sincronización completa',
    syncCheckpointed:
      'Sincronización pausada para proteger la memoria. Cierra completamente esta pestaña, vuelve a abrir Canto y sincroniza de nuevo.',
    syncDeferredAttachments: 'Algunos archivos adjuntos heredados grandes no se sincronizaron',
    syncDeferredChunkGeneration:
      'El archivo adjunto usa un formato de bloques antiguo y no se sincronizó',
    syncDeferredAttachmentNotFound:
      'No se encontró el archivo adjunto en el almacenamiento en la nube',
    syncError: 'Error de sincronización',
    passwordChangedElsewhere:
      'La contraseña se cambió en otro dispositivo. Guarda por separado cualquier cambio local sin sincronizar, elimina este diario de este dispositivo y vuelve a importarlo desde Google Drive con la nueva contraseña.',
    enableGDriveSync: 'Activar sincronización con Google Drive',
    disableSync: 'Desactivar sincronización',
    autoSync: 'Sincronización automática',
    lastSynced: 'Última sincronización',
    neverSynced: 'Nunca sincronizado',
    notConfigured: 'No configurado',
    signInToGoogle: 'Iniciar sesión con Google',
    signedInAs: 'Conectado como',
    signOut: 'Cerrar sesión',
    importFromCloud: 'Importar desde Google Drive',
    noCloudJournals: 'No se encontraron diarios en Google Drive',
    preparingImport: 'Preparando importación...',
    journalAlreadyLocal: 'Ya está en este dispositivo',
    connectAccount: 'Conectar cuenta',
    account: 'Cuenta',
    manageJournals: 'Gestionar diarios',
    deleteRemoteJournal: 'Eliminar de la nube',
    deleteRemoteConfirm:
      'Esto eliminará permanentemente este diario de Google Drive. Las copias locales no se verán afectadas. Esta acción no se puede deshacer.',
    deleteRemoteSuccess: 'Diario eliminado de la nube',
    selectProvider: 'Seleccionar proveedor de sincronización',
    googleDrive: 'Google Drive',
    loggedInWith: 'Conectado con {provider}',
    sessionRetention: 'Retención de sesión',
    retentionOneDay: '1 día',
    retentionOneWeek: '1 semana',
    retentionOneMonth: '1 mes',
    retentionNever: 'Nunca expirar',
  },
  onboarding: {
    welcomeTitle: 'Bienvenido a Canto',
    welcomeSubtitle: 'Tu diario privado y cifrado.',
    encryptionTitle: 'Tus entradas están cifradas',
    encryptionBody:
      'Canto usa cifrado AES-256. Tus datos se cifran en tu dispositivo antes de ir a cualquier lugar.',
    privacyTitle: 'Sin rastreo. Sin anuncios.\nSin recopilación de datos.',
    privacyBody:
      'Canto es código abierto. Tu diario nunca sale de tu dispositivo a menos que elijas sincronizarlo.',
    getStartedTitle: 'Empieza a escribir.',
    getStartedBody: 'Crea tu primer diario y comienza a escribir con privacidad.',
    getStartedButton: 'Comenzar',
    next: 'Siguiente',
    stepOf: '{step} de {total}',
  },
  a11y: {
    imageNofM: 'Imagen {n} de {m}',
    deleteImage: 'Eliminar imagen',
    moveLeft: 'Mover a la izquierda',
    moveRight: 'Mover a la derecha',
    downloadImage: 'Descargar imagen',
    searchPages: 'Buscar páginas',
    clearSearch: 'Limpiar búsqueda',
    filterButton: 'Filtrar',
    fileAttachment: 'Archivo adjunto',
    deleteFile: 'Eliminar archivo',
    pageEntry: 'Entrada de página',
  },
  help: {
    title: 'Ayuda',
    body: 'Si necesitas ayuda o deseas reportar un error, visita la página del proyecto Canto en GitHub.',
    linkText: 'Abrir GitHub Issues',
  },
  changelog: {
    title: 'Changelog',
    dependenciesTab: 'Dependencias',
  },
  dataIntegrity: {
    syncWarningTitle: 'Advertencia de sincronización',
    syncWarningDesc: '{failed} de {total} páginas no pudieron descargarse.',
    syncSuggestion:
      'Verifica tu conexión a internet e intenta de nuevo. También puedes mantener la importación parcial y sincronizar después.',
    keepPartial: 'Mantener parcial',
    importWarningTitle: 'Advertencia de importación',
    importWarningDesc:
      '{count} archivo(s) adjunto(s) no pudieron guardarse durante la importación.',
    importSuggestion:
      'El diario fue importado pero faltan algunos archivos adjuntos. Intenta importar de nuevo desde el mismo archivo de respaldo para recuperarlos.',
    failedItems: 'Elementos fallidos',
    retry: 'Reintentar',
    acknowledge: 'OK',
  },
};

const de: Dictionary = {
  app: {
    name: 'Canto',
    tagline: 'Dein privates Tagebuch',
  },
  common: {
    cancel: 'Abbrechen',
    save: 'Speichern',
    delete: 'Löschen',
    edit: 'Bearbeiten',
    create: 'Erstellen',
    open: 'Öffnen',
    close: 'Schließen',
    search: 'Suchen',
    settings: 'Einstellungen',
    loading: 'Laden...',
    confirm: 'Bestätigen',
    done: 'Fertig',
    skip: 'Überspringen',
  },
  home: {
    title: 'Tagebücher',
    newJournal: 'Neues Tagebuch',
    noJournals: 'Noch keine Tagebücher. Erstelle eins um loszulegen!',
    journalName: 'Tagebuchname',
    selectIcon: 'Symbol auswählen',
    password: 'Passwort',
    confirmPassword: 'Passwort bestätigen',
    passwordMismatch: 'Passwörter stimmen nicht überein',
    passwordOptional: 'Optional',
    wrongPassword: 'Falsches Passwort',
    unlockJournal: 'Tagebuch entsperren',
    passwordTooShort: 'Passwort muss mindestens 8 Zeichen lang sein',
    tooManyAttempts: 'Zu viele Versuche. Versuche es später erneut.',
    passwordWarning:
      'Es gibt keine Passwortwiederherstellung. Wenn du dein Passwort vergisst, gehen deine Daten dauerhaft verloren.',
    biometricLock: 'Biometrische Entsperrung',
    biometricReason: 'Authentifizieren um Tagebuch zu entsperren',
    biometricUnavailable: 'Biometrische Authentifizierung ist auf diesem Gerät nicht verfügbar',
    passwordExplainTitle: 'Wie schützt Canto Ihre Daten?',
    passwordExplainBody:
      'Alle Ihre Tagebücher sind immer auf diesem Gerät mit einem einzigartigen Geräteschlüssel verschlüsselt, der in sicherer Hardware gespeichert ist.\n\nDas Hinzufügen eines Passworts bietet eine zusätzliche Verschlüsselungsebene über dem Geräteschlüssel. Das bedeutet, dass selbst wenn jemand Zugriff auf Ihre Gerätedateien erhält, er Ihr Tagebuch ohne das Passwort nicht lesen kann.\n\nWenn Sie kein Passwort festlegen, sind Ihre Daten trotzdem mit dem Geräteschlüssel verschlüsselt — es wird nur kein Passwort zum Öffnen benötigt.',
    decrypting: 'Entschlüsseln...',
  },
  journal: {
    title: 'Seiten',
    newPage: 'Neue Seite',
    noPages: 'Noch keine Seiten. Erstelle deinen ersten Eintrag!',
    filter: 'Filtern',
    sort: 'Sortieren',
    anniversary: 'Jahrestag',
  },
  calendar: {
    titleSuffix: 'Kalender',
    anniversaryRow: '{count} Seiten feiern heute Jahrestag',
    anniversaryRowOne: '1 Seite feiert heute Jahrestag',
    anniversaryRowZero: 'Keine Jahrestage heute',
    noPages: 'Noch keine Seiten',
  },
  page: {
    title: 'Seite',
    placeholder: 'Beginne zu schreiben...',
    tags: 'Tags',
    attachments: 'Anhänge',
    comments: 'Kommentare',
    location: 'Standort',
    addImage: 'Bild',
    addEncryptedImage: 'Verschlüsseltes Bild',
    addFile: 'Datei',
    addEncryptedFile: 'Verschlüsselte Datei',
    addLocation: 'Standort',
    addComment: 'Kommentar hinzufügen',
    addTag: 'Tag hinzufügen',
    newTag: 'Neuer Tag...',
    noComments: 'Noch keine Kommentare',
    discardChanges: 'Änderungen verwerfen?',
    discardMessage: 'Du hast ungespeicherte Änderungen. Verwerfen?',
    discard: 'Verwerfen',
    keep: 'Weiter bearbeiten',
    deleteConfirm: 'Eintrag löschen?',
    deleteMessage: 'Dieser Eintrag wird dauerhaft gelöscht.',
    locationCopied: 'Koordinaten kopiert',
    decrypting: 'Entschlüsseln...',
    takePhoto: 'Foto aufnehmen',
    takeEncryptedPhoto: 'Verschlüsseltes Foto',
    cameraPermissionDenied: 'Kameraberechtigung verweigert',
  },
  settings: {
    theme: 'Thema',
    language: 'Sprache',
    darkMode: 'Dunkler Modus',
    lightMode: 'Heller Modus',
    appearance: 'Erscheinungsbild',
    fontSize: 'Schriftgröße',
    fontFamily: 'Schriftart',
    fontSizeSmall: 'Klein',
    fontSizeDefault: 'Standard',
    fontSizeLarge: 'Groß',
    fontSizeXLarge: 'Sehr groß',
    fontFamilyDefault: 'Standard',
    fontFamilyDyslexic: 'OpenDyslexic',
    fontFamilySerif: 'Serif',
  },
  passwordStrength: {
    weak: 'Schwach',
    fair: 'Akzeptabel',
    strong: 'Stark',
    min8: '8+ Zeichen',
    min12: '12+ Zeichen',
    lowercase: 'Kleinbuchstabe',
    uppercase: 'Großbuchstabe',
    digit: 'Zahl',
    special: 'Sonderzeichen',
  },
  journalSettings: {
    title: 'Tagebuch-Einstellungen',
    stats: 'Statistiken',
    pageCount: 'Erstellte Seiten',
    createdOn: 'Erstellt am',
    displaySettings: 'Anzeige',
    use24h: '24-Stunden-Format',
    previewTags: 'Tags in Vorschau anzeigen',
    previewThumbnail: 'Miniatur in Vorschau anzeigen',
    previewIcons: 'Inhaltsicons in Vorschau anzeigen',
    filterBarToggle: 'Filterleiste anzeigen',
    autoLocation: 'Standort automatisch hinzufügen',
    sortOrder: 'Sortierreihenfolge',
    ascending: 'Älteste zuerst',
    descending: 'Neueste zuerst',
    none: 'Keine Sortierung',
    changeIcon: 'Symbol ändern',
    changeName: 'Name ändern',
    newName: 'Neuer Name',
    changePassword: 'Passwort ändern',
    currentPassword: 'Aktuelles Passwort',
    newPassword: 'Neues Passwort',
    confirmNewPassword: 'Neues Passwort bestätigen',
    removePassword: 'Passwort entfernen',
    removePasswordHint: 'Leer lassen um Passwortschutz zu entfernen',
    passwordChanged: 'Passwort erfolgreich geändert',
    passwordRemoved: 'Passwortschutz entfernt',
    passwordAdded: 'Passwortschutz hinzugefügt',
    passwordProtectionUpdatedWithExceptions: 'Passwortschutz mit Ausnahmen aktualisiert',
    passwordProtectionExceptionDescription:
      'Die folgenden Dateien bleiben auf dem Gerät verschlüsselt, sind jedoch nicht durch dieses Tagebuchpasswort geschützt. Sie können auch in synchronisierten Sicherungen ungeschützt sein:',
    dangerZone: 'Gefahrenzone',
    deleteJournal: 'Tagebuch löschen',
    deleteConfirmSecure: 'Gib dein Passwort ein um dieses Tagebuch zu löschen',
    typeToDelete: "Tippe 'delete {name}' zur Bestätigung",
    reencrypting: 'Daten werden neu verschlüsselt...',
    reencryptProgress: 'Verarbeite {current} von {total}...',
    themeOverride: 'Thema',
    useGlobalTheme: 'Globales Thema verwenden',
  },
  filterBar: {
    searchPlaceholder: 'Suchen...',
    from: 'Von',
    to: 'Bis',
    clearFilters: 'Löschen',
    hasImage: 'Bilder',
    hasFile: 'Dateien',
    hasLocation: 'Standort',
    tags: 'Tags',
    filterBy: 'Filtern nach',
    noTagsAvailable: 'Keine Tags in diesem Tagebuch',
  },
  security: {
    title: 'Sicherheit',
    keyStrength: 'Schlüsselstärke',
    kdfHint: 'Mehr Iterationen verlangsamen das Entsperren, erhöhen aber die Sicherheit',
    kdfExplainTitle: 'Was ist Schlüsselstärke?',
    kdfExplainBody:
      'Wenn Sie ein Passwort festlegen, wird Ihr Tagebuch mit einem daraus abgeleiteten Schlüssel verschlüsselt. Die Schlüsselstärke bestimmt, wie viele Iterationen des PBKDF2-Algorithmus zur Ableitung dieses Schlüssels verwendet werden.\n\nMehr Iterationen machen den Schlüssel erheblich schwerer zu knacken, verlangsamen aber auch das Entsperren — besonders auf älteren Geräten.\n\nVerfügbare Stufen:\n• Schnell — 50.000 Iterationen\n• Verbessert — 100.000 Iterationen\n• Moderat — 200.000 Iterationen\n• Stark — 600.000 Iterationen\n• Sehr stark — 800.000 Iterationen\n• Extrem — 1.000.000 Iterationen\n\nFür die meisten Nutzer reicht "Schnell" aus. Wählen Sie eine höhere Stufe, wenn Sicherheit Vorrang vor Entsperrgeschwindigkeit hat.',
    kdf: {
      fast: 'Schnell',
      improved: 'Verbessert',
      moderate: 'Moderat',
      strong: 'Stark',
      great: 'Sehr stark',
      extreme: 'Extrem',
    },
    autoLock: 'Automatische Sperre',
    autoLockOff: 'Aus',
    autoLock1m: '1 Minute',
    autoLock5m: '5 Minuten',
    autoLock15m: '15 Minuten',
    autoLockTitle: 'Sitzung gesperrt',
    autoLockMessage:
      'Ihre Sitzung wurde wegen Inaktivität gesperrt. Sie werden zum Startbildschirm weitergeleitet.',
    rotateDeviceKey: 'Geräteschlüssel rotieren',
    rotateExplain:
      'Ihre Daten werden mit einem einzigartigen Schlüssel verschlüsselt, der sicher auf diesem Gerät gespeichert ist. Das Rotieren des Schlüssels erzeugt einen neuen und verschlüsselt alle Tagebücher, Seiten und Anhänge neu. Empfohlen, wenn Sie vermuten, dass Ihr Gerät kompromittiert wurde. Der Vorgang kann je nach Datenmenge einige Sekunden bis mehrere Minuten dauern.',
    rotateWarning:
      'Alle Tagebücher, Seiten und Anhänge werden mit einem neuen Schlüssel neu verschlüsselt. Dies kann bei großen Tagebüchern einige Minuten dauern. Schließen Sie die App nicht, bis der Vorgang abgeschlossen ist — eine Unterbrechung könnte Daten in einem gemischten Zustand hinterlassen.',
    rotateConfirm: 'Schlüssel rotieren',
    rotating: 'Geräteschlüssel wird rotiert...',
    rotateSuccess: 'Geräteschlüssel erfolgreich rotiert',
    doNotClose: 'App nicht schließen',
  },
  backup: {
    export: 'Exportieren',
    import: 'Importieren',
    exportJournal: 'Tagebuch exportieren',
    importFromBackup: 'Aus Backup importieren',
    includeEncryption: 'Verschlüsselung einschließen',
    exporting: 'Exportiere...',
    exportComplete: 'Export bereit',
    exportError: 'Export fehlgeschlagen',
    importPassword: 'Dieses Backup ist verschlüsselt. Passwort eingeben:',
    importConflict: 'Ein Tagebuch mit diesem Namen existiert bereits',
    importRename: 'Tagebuch umbenennen',
    importSuccess: 'Tagebuch erfolgreich importiert',
    importError: 'Import fehlgeschlagen',
    invalidFile: 'Ungültige Backup-Datei',
    importing: 'Importiere...',
    or: 'ODER',
  },
  sync: {
    sync: 'Synchronisieren',
    syncNow: 'Jetzt synchronisieren',
    syncing: 'Synchronisiere...',
    syncComplete: 'Synchronisierung abgeschlossen',
    syncCheckpointed:
      'Synchronisierung zum Schutz des Speichers angehalten. Schließen Sie diesen Tab vollständig, öffnen Sie Canto erneut und synchronisieren Sie wieder.',
    syncDeferredAttachments: 'Einige große ältere Anhänge wurden nicht synchronisiert',
    syncDeferredChunkGeneration:
      'Der Anhang verwendet ein älteres Chunk-Format und wurde nicht synchronisiert',
    syncDeferredAttachmentNotFound: 'Der Anhang wurde nicht im Cloud-Speicher gefunden',
    syncError: 'Synchronisierung fehlgeschlagen',
    passwordChangedElsewhere:
      'Das Passwort wurde auf einem anderen Gerät geändert. Speichere alle nicht synchronisierten lokalen Änderungen separat, entferne dieses lokale Journal und importiere es mit dem neuen Passwort erneut aus Google Drive.',
    enableGDriveSync: 'Google Drive-Synchronisierung aktivieren',
    disableSync: 'Synchronisierung deaktivieren',
    autoSync: 'Automatische Synchronisierung',
    lastSynced: 'Zuletzt synchronisiert',
    neverSynced: 'Nie synchronisiert',
    notConfigured: 'Nicht konfiguriert',
    signInToGoogle: 'Mit Google anmelden',
    signedInAs: 'Angemeldet als',
    signOut: 'Abmelden',
    importFromCloud: 'Von Google Drive importieren',
    noCloudJournals: 'Keine Tagebücher auf Google Drive gefunden',
    preparingImport: 'Import wird vorbereitet...',
    journalAlreadyLocal: 'Bereits auf diesem Gerät',
    connectAccount: 'Konto verbinden',
    account: 'Konto',
    manageJournals: 'Tagebücher verwalten',
    deleteRemoteJournal: 'Aus der Cloud löschen',
    deleteRemoteConfirm:
      'Dies wird dieses Tagebuch dauerhaft aus Google Drive löschen. Lokale Kopien werden nicht betroffen. Diese Aktion kann nicht rückgängig gemacht werden.',
    deleteRemoteSuccess: 'Tagebuch aus der Cloud gelöscht',
    selectProvider: 'Sync-Anbieter auswählen',
    googleDrive: 'Google Drive',
    loggedInWith: 'Angemeldet mit {provider}',
    sessionRetention: 'Sitzungsspeicherung',
    retentionOneDay: '1 Tag',
    retentionOneWeek: '1 Woche',
    retentionOneMonth: '1 Monat',
    retentionNever: 'Nie ablaufen',
  },
  onboarding: {
    welcomeTitle: 'Willkommen bei Canto',
    welcomeSubtitle: 'Dein privates, verschlüsseltes Tagebuch.',
    encryptionTitle: 'Deine Einträge sind verschlüsselt',
    encryptionBody:
      'Canto verwendet AES-256-Verschlüsselung. Deine Daten werden auf deinem Gerät verschlüsselt, bevor sie irgendwohin gehen.',
    privacyTitle: 'Kein Tracking. Keine Werbung.\nKeine Datenerfassung.',
    privacyBody:
      'Canto ist Open Source. Dein Tagebuch verlässt dein Gerät nie, es sei denn, du entscheidest dich für die Synchronisierung.',
    getStartedTitle: 'Fang an zu schreiben.',
    getStartedBody: 'Erstelle dein erstes Tagebuch und beginne privat zu schreiben.',
    getStartedButton: 'Loslegen',
    next: 'Weiter',
    stepOf: '{step} von {total}',
  },
  a11y: {
    imageNofM: 'Bild {n} von {m}',
    deleteImage: 'Bild löschen',
    moveLeft: 'Nach links verschieben',
    moveRight: 'Nach rechts verschieben',
    downloadImage: 'Bild herunterladen',
    searchPages: 'Seiten durchsuchen',
    clearSearch: 'Suche löschen',
    filterButton: 'Filtern',
    fileAttachment: 'Dateianhang',
    deleteFile: 'Datei löschen',
    pageEntry: 'Seiteneintrag',
  },
  help: {
    title: 'Hilfe',
    body: 'Wenn Sie Hilfe benötigen oder einen Fehler melden möchten, besuchen Sie die Canto-Projektseite auf GitHub.',
    linkText: 'GitHub Issues öffnen',
  },
  changelog: {
    title: 'Changelog',
    dependenciesTab: 'Abhängigkeiten',
  },
  dataIntegrity: {
    syncWarningTitle: 'Sync-Warnung',
    syncWarningDesc: '{failed} von {total} Seiten konnten nicht heruntergeladen werden.',
    syncSuggestion:
      'Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut. Sie können auch den teilweisen Import behalten und später erneut synchronisieren.',
    keepPartial: 'Teilweise behalten',
    importWarningTitle: 'Import-Warnung',
    importWarningDesc: '{count} Anhang/Anhänge konnten beim Import nicht gespeichert werden.',
    importSuggestion:
      'Das Tagebuch wurde importiert, aber einige Anhänge fehlen. Versuchen Sie, erneut aus derselben Sicherungsdatei zu importieren.',
    failedItems: 'Fehlgeschlagene Elemente',
    retry: 'Erneut versuchen',
    acknowledge: 'OK',
  },
};

const fr: Dictionary = {
  app: {
    name: 'Canto',
    tagline: 'Votre journal privé',
  },
  common: {
    cancel: 'Annuler',
    save: 'Enregistrer',
    delete: 'Supprimer',
    edit: 'Modifier',
    create: 'Créer',
    open: 'Ouvrir',
    close: 'Fermer',
    search: 'Rechercher',
    settings: 'Paramètres',
    loading: 'Chargement...',
    confirm: 'Confirmer',
    done: 'Terminé',
    skip: 'Passer',
  },
  home: {
    title: 'Journaux',
    newJournal: 'Nouveau Journal',
    noJournals: 'Pas encore de journaux. Créez-en un pour commencer!',
    journalName: 'Nom du journal',
    selectIcon: 'Choisir une icône',
    password: 'Mot de passe',
    confirmPassword: 'Confirmer le mot de passe',
    passwordMismatch: 'Les mots de passe ne correspondent pas',
    passwordOptional: 'Optionnel',
    wrongPassword: 'Mot de passe incorrect',
    unlockJournal: 'Déverrouiller le Journal',
    passwordTooShort: 'Le mot de passe doit contenir au moins 8 caractères',
    tooManyAttempts: 'Trop de tentatives. Réessayez plus tard.',
    passwordWarning:
      "Il n'y a pas de récupération de mot de passe. Si vous oubliez votre mot de passe, vos données seront définitivement perdues.",
    biometricLock: 'Déverrouillage biométrique',
    biometricReason: 'Authentifiez-vous pour déverrouiller le journal',
    biometricUnavailable: "L'authentification biométrique n'est pas disponible sur cet appareil",
    passwordExplainTitle: 'Comment Canto protège-t-il vos données ?',
    passwordExplainBody:
      "Tous vos journaux sont toujours chiffrés sur cet appareil avec une clé unique stockée dans le matériel sécurisé.\n\nAjouter un mot de passe fournit une couche de chiffrement supplémentaire par-dessus la clé de l'appareil. Cela signifie que même si quelqu'un accède aux fichiers de votre appareil, il ne pourra pas lire votre journal sans le mot de passe.\n\nSi vous choisissez de ne pas définir de mot de passe, vos données sont toujours chiffrées avec la clé de l'appareil — aucun mot de passe ne sera requis pour l'ouvrir.",
    decrypting: 'Déchiffrement...',
  },
  journal: {
    title: 'Pages',
    newPage: 'Nouvelle Page',
    noPages: 'Pas encore de pages. Créez votre première entrée!',
    filter: 'Filtrer',
    sort: 'Trier',
    anniversary: 'Anniversaire',
  },
  calendar: {
    titleSuffix: 'Calendrier',
    anniversaryRow: "{count} pages célèbrent un anniversaire aujourd'hui",
    anniversaryRowOne: "1 page célèbre un anniversaire aujourd'hui",
    anniversaryRowZero: "Aucun anniversaire aujourd'hui",
    noPages: 'Pas encore de pages',
  },
  page: {
    title: 'Page',
    placeholder: 'Commencez à écrire...',
    tags: 'Tags',
    attachments: 'Pièces jointes',
    comments: 'Commentaires',
    location: 'Emplacement',
    addImage: 'Image',
    addEncryptedImage: 'Image Chiffrée',
    addFile: 'Fichier',
    addEncryptedFile: 'Fichier Chiffré',
    addLocation: 'Emplacement',
    addComment: 'Ajouter un commentaire',
    addTag: 'Ajouter un tag',
    newTag: 'Nouveau tag...',
    noComments: 'Pas encore de commentaires',
    discardChanges: 'Abandonner les modifications?',
    discardMessage: 'Vous avez des modifications non enregistrées. Les abandonner?',
    discard: 'Abandonner',
    keep: 'Continuer à éditer',
    deleteConfirm: "Supprimer l'entrée?",
    deleteMessage: 'Cette entrée sera définitivement supprimée.',
    locationCopied: 'Coordonnées copiées',
    decrypting: 'Déchiffrement...',
    takePhoto: 'Prendre une Photo',
    takeEncryptedPhoto: 'Photo Chiffrée',
    cameraPermissionDenied: 'Autorisation de la caméra refusée',
  },
  settings: {
    theme: 'Thème',
    language: 'Langue',
    darkMode: 'Mode Sombre',
    lightMode: 'Mode Clair',
    appearance: 'Apparence',
    fontSize: 'Taille de police',
    fontFamily: 'Police',
    fontSizeSmall: 'Petit',
    fontSizeDefault: 'Par défaut',
    fontSizeLarge: 'Grand',
    fontSizeXLarge: 'Très grand',
    fontFamilyDefault: 'Par défaut',
    fontFamilyDyslexic: 'OpenDyslexic',
    fontFamilySerif: 'Serif',
  },
  passwordStrength: {
    weak: 'Faible',
    fair: 'Correct',
    strong: 'Fort',
    min8: '8+ caractères',
    min12: '12+ caractères',
    lowercase: 'lettre minuscule',
    uppercase: 'lettre majuscule',
    digit: 'chiffre',
    special: 'caractère spécial',
  },
  journalSettings: {
    title: 'Paramètres du Journal',
    stats: 'Statistiques',
    pageCount: 'Pages créées',
    createdOn: 'Créé le',
    displaySettings: 'Affichage',
    use24h: 'Format 24 heures',
    previewTags: "Afficher les tags dans l'aperçu",
    previewThumbnail: "Afficher la miniature dans l'aperçu",
    previewIcons: "Afficher les icônes de contenu dans l'aperçu",
    filterBarToggle: 'Afficher la barre de filtres',
    autoLocation: "Ajouter l'emplacement automatiquement",
    sortOrder: 'Ordre de tri',
    ascending: 'Plus anciens en premier',
    descending: 'Plus récents en premier',
    none: 'Pas de tri',
    changeIcon: "Changer l'icône",
    changeName: 'Changer le nom',
    newName: 'Nouveau nom',
    changePassword: 'Changer le mot de passe',
    currentPassword: 'Mot de passe actuel',
    newPassword: 'Nouveau mot de passe',
    confirmNewPassword: 'Confirmer le nouveau mot de passe',
    removePassword: 'Supprimer le mot de passe',
    removePasswordHint: 'Laisser vide pour supprimer la protection par mot de passe',
    passwordChanged: 'Mot de passe modifié avec succès',
    passwordRemoved: 'Protection par mot de passe supprimée',
    passwordAdded: 'Protection par mot de passe ajoutée',
    passwordProtectionUpdatedWithExceptions:
      'Protection par mot de passe mise à jour avec des exceptions',
    passwordProtectionExceptionDescription:
      'Les fichiers suivants restent chiffrés sur l’appareil, mais ne sont pas protégés par ce mot de passe de journal. Ils peuvent également ne pas être protégés dans les sauvegardes synchronisées :',
    dangerZone: 'Zone de danger',
    deleteJournal: 'Supprimer le journal',
    deleteConfirmSecure: 'Entrez votre mot de passe pour supprimer ce journal',
    typeToDelete: "Tapez 'delete {name}' pour confirmer",
    reencrypting: 'Re-chiffrement des données...',
    reencryptProgress: 'Traitement de {current} sur {total}...',
    themeOverride: 'Thème',
    useGlobalTheme: 'Utiliser le thème global',
  },
  filterBar: {
    searchPlaceholder: 'Rechercher...',
    from: 'Du',
    to: 'Au',
    clearFilters: 'Effacer',
    hasImage: 'Images',
    hasFile: 'Fichiers',
    hasLocation: 'Emplacement',
    tags: 'Tags',
    filterBy: 'Filtrer par',
    noTagsAvailable: 'Aucun tag dans ce journal',
  },
  security: {
    title: 'Sécurité',
    keyStrength: 'Force de la clé',
    kdfHint: "Plus d'itérations ralentit le déverrouillage mais renforce la sécurité",
    kdfExplainTitle: "Qu'est-ce que la force de la clé ?",
    kdfExplainBody:
      "Lorsque vous définissez un mot de passe, votre journal est chiffré à l'aide d'une clé dérivée de celui-ci. La force de la clé contrôle le nombre d'itérations de l'algorithme PBKDF2 utilisées pour dériver cette clé.\n\nPlus d'itérations rendent la clé beaucoup plus difficile à craquer par force brute, mais ralentissent aussi le déverrouillage — surtout sur les appareils plus anciens.\n\nNiveaux disponibles :\n• Rapide — 50 000 itérations\n• Amélioré — 100 000 itérations\n• Modéré — 200 000 itérations\n• Fort — 600 000 itérations\n• Excellent — 800 000 itérations\n• Extrême — 1 000 000 itérations\n\nPour la plupart des utilisateurs, \"Rapide\" est suffisant. Choisissez un niveau supérieur si vous privilégiez la sécurité.",
    kdf: {
      fast: 'Rapide',
      improved: 'Amélioré',
      moderate: 'Modéré',
      strong: 'Fort',
      great: 'Excellent',
      extreme: 'Extrême',
    },
    autoLock: 'Verrouillage automatique',
    autoLockOff: 'Désactivé',
    autoLock1m: '1 minute',
    autoLock5m: '5 minutes',
    autoLock15m: '15 minutes',
    autoLockTitle: 'Session verrouillée',
    autoLockMessage:
      "Votre session a été verrouillée en raison d'inactivité. Vous serez redirigé vers l'écran d'accueil.",
    rotateDeviceKey: "Rotation de la clé de l'appareil",
    rotateExplain:
      'Vos données sont chiffrées avec une clé unique stockée de manière sécurisée sur cet appareil. La rotation de la clé en génère une nouvelle et re-chiffre tous les journaux, pages et pièces jointes. Recommandé si vous soupçonnez que votre appareil a été compromis. Le processus peut prendre de quelques secondes à plusieurs minutes selon la quantité de données.',
    rotateWarning:
      "Tous les journaux, pages et pièces jointes seront re-chiffrés avec une nouvelle clé. Cela peut prendre plusieurs minutes pour les gros journaux. Ne fermez pas l'application avant la fin du processus — une interruption pourrait laisser les données dans un état mixte.",
    rotateConfirm: 'Effectuer la rotation',
    rotating: "Rotation de la clé de l'appareil...",
    rotateSuccess: "Clé de l'appareil mise à jour avec succès",
    doNotClose: "Ne fermez pas l'application",
  },
  backup: {
    export: 'Exporter',
    import: 'Importer',
    exportJournal: 'Exporter le journal',
    importFromBackup: 'Importer depuis une sauvegarde',
    includeEncryption: 'Inclure le chiffrement',
    exporting: 'Exportation...',
    exportComplete: 'Exportation prête',
    exportError: "Échec de l'exportation",
    importPassword: 'Cette sauvegarde est chiffrée. Entrez le mot de passe :',
    importConflict: 'Un journal avec ce nom existe déjà',
    importRename: 'Renommer le journal',
    importSuccess: 'Journal importé avec succès',
    importError: "Échec de l'importation",
    invalidFile: 'Fichier de sauvegarde invalide',
    importing: 'Importation...',
    or: 'OU',
  },
  sync: {
    sync: 'Synchroniser',
    syncNow: 'Synchroniser maintenant',
    syncing: 'Synchronisation...',
    syncComplete: 'Synchronisation terminée',
    syncCheckpointed:
      'Synchronisation suspendue pour protéger la mémoire. Fermez complètement cet onglet, rouvrez Canto, puis synchronisez à nouveau.',
    syncDeferredAttachments:
      'Certaines pièces jointes héritées volumineuses n’ont pas été synchronisées',
    syncDeferredChunkGeneration:
      'La pièce jointe utilise un ancien format de blocs et n’a pas été synchronisée',
    syncDeferredAttachmentNotFound: 'La pièce jointe est introuvable dans le stockage cloud',
    syncError: 'Échec de la synchronisation',
    passwordChangedElsewhere:
      'Le mot de passe a été modifié sur un autre appareil. Enregistrez séparément les modifications locales non synchronisées, supprimez ce journal local, puis réimportez-le depuis Google Drive avec le nouveau mot de passe.',
    enableGDriveSync: 'Activer la synchronisation Google Drive',
    disableSync: 'Désactiver la synchronisation',
    autoSync: 'Synchronisation automatique',
    lastSynced: 'Dernière synchronisation',
    neverSynced: 'Jamais synchronisé',
    notConfigured: 'Non configuré',
    signInToGoogle: 'Se connecter à Google',
    signedInAs: 'Connecté en tant que',
    signOut: 'Se déconnecter',
    importFromCloud: 'Importer depuis Google Drive',
    noCloudJournals: 'Aucun journal trouvé sur Google Drive',
    preparingImport: "Préparation de l'import...",
    journalAlreadyLocal: 'Déjà sur cet appareil',
    connectAccount: 'Connecter un compte',
    account: 'Compte',
    manageJournals: 'Gérer les journaux',
    deleteRemoteJournal: 'Supprimer du cloud',
    deleteRemoteConfirm:
      'Cela supprimera définitivement ce journal de Google Drive. Les copies locales ne seront pas affectées. Cette action est irréversible.',
    deleteRemoteSuccess: 'Journal supprimé du cloud',
    selectProvider: 'Choisir le fournisseur de synchronisation',
    googleDrive: 'Google Drive',
    loggedInWith: 'Connecté avec {provider}',
    sessionRetention: 'Conservation de session',
    retentionOneDay: '1 jour',
    retentionOneWeek: '1 semaine',
    retentionOneMonth: '1 mois',
    retentionNever: 'Ne jamais expirer',
  },
  onboarding: {
    welcomeTitle: 'Bienvenue sur Canto',
    welcomeSubtitle: 'Votre journal privé et chiffré.',
    encryptionTitle: 'Vos entrées sont chiffrées',
    encryptionBody:
      'Canto utilise le chiffrement AES-256. Vos données sont chiffrées sur votre appareil avant tout transfert.',
    privacyTitle: 'Pas de suivi. Pas de pubs.\nPas de collecte de données.',
    privacyBody:
      'Canto est open source. Votre journal ne quitte jamais votre appareil sauf si vous choisissez de le synchroniser.',
    getStartedTitle: 'Commencez à écrire.',
    getStartedBody: 'Créez votre premier journal et commencez à écrire en toute confidentialité.',
    getStartedButton: 'Commencer',
    next: 'Suivant',
    stepOf: '{step} sur {total}',
  },
  a11y: {
    imageNofM: 'Image {n} sur {m}',
    deleteImage: "Supprimer l'image",
    moveLeft: 'Déplacer à gauche',
    moveRight: 'Déplacer à droite',
    downloadImage: "Télécharger l'image",
    searchPages: 'Rechercher des pages',
    clearSearch: 'Effacer la recherche',
    filterButton: 'Filtrer',
    fileAttachment: 'Pièce jointe',
    deleteFile: 'Supprimer le fichier',
    pageEntry: 'Entrée de page',
  },
  help: {
    title: 'Aide',
    body: "Si vous avez besoin d'aide ou souhaitez signaler un bug, visitez la page du projet Canto sur GitHub.",
    linkText: 'Ouvrir GitHub Issues',
  },
  changelog: {
    title: 'Changelog',
    dependenciesTab: 'Dépendances',
  },
  dataIntegrity: {
    syncWarningTitle: 'Avertissement de synchronisation',
    syncWarningDesc: "{failed} sur {total} pages n'ont pas pu être téléchargées.",
    syncSuggestion:
      "Vérifiez votre connexion Internet et réessayez. Vous pouvez aussi conserver l'importation partielle et resynchroniser plus tard.",
    keepPartial: 'Conserver partiel',
    importWarningTitle: "Avertissement d'importation",
    importWarningDesc:
      "{count} pièce(s) jointe(s) n'ont pas pu être enregistrées lors de l'importation.",
    importSuggestion:
      "Le journal a été importé mais certaines pièces jointes sont manquantes. Essayez d'importer à nouveau depuis le même fichier de sauvegarde.",
    failedItems: 'Éléments échoués',
    retry: 'Réessayer',
    acknowledge: 'OK',
  },
};

const ru: Dictionary = {
  app: {
    name: 'Canto',
    tagline: 'Ваш личный дневник',
  },
  common: {
    cancel: 'Отмена',
    save: 'Сохранить',
    delete: 'Удалить',
    edit: 'Редактировать',
    create: 'Создать',
    open: 'Открыть',
    close: 'Закрыть',
    search: 'Поиск',
    settings: 'Настройки',
    loading: 'Загрузка...',
    confirm: 'Подтвердить',
    done: 'Готово',
    skip: 'Пропустить',
  },
  home: {
    title: 'Дневники',
    newJournal: 'Новый дневник',
    noJournals: 'Дневников пока нет. Создайте один, чтобы начать!',
    journalName: 'Название дневника',
    selectIcon: 'Выбрать иконку',
    password: 'Пароль',
    confirmPassword: 'Подтвердите пароль',
    passwordMismatch: 'Пароли не совпадают',
    passwordOptional: 'Необязательно',
    wrongPassword: 'Неверный пароль',
    unlockJournal: 'Разблокировать дневник',
    passwordTooShort: 'Пароль должен содержать не менее 8 символов',
    tooManyAttempts: 'Слишком много попыток. Попробуйте позже.',
    passwordWarning:
      'Восстановление пароля невозможно. Если вы забудете пароль, ваши данные будут потеряны навсегда.',
    biometricLock: 'Биометрическая разблокировка',
    biometricReason: 'Аутентифицируйтесь для разблокировки дневника',
    biometricUnavailable: 'Биометрическая аутентификация недоступна на этом устройстве',
    passwordExplainTitle: 'Как Canto защищает ваши данные?',
    passwordExplainBody:
      'Все ваши дневники всегда зашифрованы на этом устройстве уникальным ключом устройства, хранящимся в защищенном аппаратном модуле.\n\nДобавление пароля обеспечивает дополнительный уровень шифрования поверх ключа устройства. Это означает, что даже если кто-то получит доступ к файлам вашего устройства, он не сможет прочитать ваш дневник без пароля.\n\nЕсли вы решите не устанавливать пароль, ваши данные все равно зашифрованы ключом устройства — просто для открытия не потребуется пароль.',
    decrypting: 'Расшифровка...',
  },
  journal: {
    title: 'Страницы',
    newPage: 'Новая страница',
    noPages: 'Страниц пока нет. Создайте первую запись!',
    filter: 'Фильтр',
    sort: 'Сортировка',
    anniversary: 'Годовщина',
  },
  calendar: {
    titleSuffix: 'Календарь',
    anniversaryRow: '{count} страниц отмечают годовщину сегодня',
    anniversaryRowOne: '1 страница отмечает годовщину сегодня',
    anniversaryRowZero: 'Сегодня нет годовщин',
    noPages: 'Страниц пока нет',
  },
  page: {
    title: 'Страница',
    placeholder: 'Начните писать...',
    tags: 'Теги',
    attachments: 'Вложения',
    comments: 'Комментарии',
    location: 'Местоположение',
    addImage: 'Изображение',
    addEncryptedImage: 'Зашифрованное изображение',
    addFile: 'Файл',
    addEncryptedFile: 'Зашифрованный файл',
    addLocation: 'Местоположение',
    addComment: 'Добавить комментарий',
    addTag: 'Добавить тег',
    newTag: 'Новый тег...',
    noComments: 'Комментариев пока нет',
    discardChanges: 'Отменить изменения?',
    discardMessage: 'У вас есть несохраненные изменения. Отменить?',
    discard: 'Отменить',
    keep: 'Продолжить редактирование',
    deleteConfirm: 'Удалить запись?',
    deleteMessage: 'Эта запись будет удалена навсегда.',
    locationCopied: 'Координаты скопированы',
    decrypting: 'Расшифровка...',
    takePhoto: 'Сделать фото',
    takeEncryptedPhoto: 'Зашифрованное фото',
    cameraPermissionDenied: 'Доступ к камере запрещён',
  },
  settings: {
    theme: 'Тема',
    language: 'Язык',
    darkMode: 'Темный режим',
    lightMode: 'Светлый режим',
    appearance: 'Внешний вид',
    fontSize: 'Размер шрифта',
    fontFamily: 'Шрифт',
    fontSizeSmall: 'Маленький',
    fontSizeDefault: 'По умолчанию',
    fontSizeLarge: 'Большой',
    fontSizeXLarge: 'Очень большой',
    fontFamilyDefault: 'По умолчанию',
    fontFamilyDyslexic: 'OpenDyslexic',
    fontFamilySerif: 'Serif',
  },
  passwordStrength: {
    weak: 'Слабый',
    fair: 'Средний',
    strong: 'Сильный',
    min8: '8+ символов',
    min12: '12+ символов',
    lowercase: 'строчная буква',
    uppercase: 'заглавная буква',
    digit: 'цифра',
    special: 'спецсимвол',
  },
  journalSettings: {
    title: 'Настройки дневника',
    stats: 'Статистика',
    pageCount: 'Создано страниц',
    createdOn: 'Создан',
    displaySettings: 'Отображение',
    use24h: '24-часовой формат',
    previewTags: 'Показывать теги в превью',
    previewThumbnail: 'Показывать миниатюру в превью',
    previewIcons: 'Показывать иконки содержимого в превью',
    filterBarToggle: 'Показать панель фильтров',
    autoLocation: 'Автоматически добавлять местоположение',
    sortOrder: 'Порядок сортировки',
    ascending: 'Сначала старые',
    descending: 'Сначала новые',
    none: 'Без сортировки',
    changeIcon: 'Изменить иконку',
    changeName: 'Изменить название',
    newName: 'Новое название',
    changePassword: 'Изменить пароль',
    currentPassword: 'Текущий пароль',
    newPassword: 'Новый пароль',
    confirmNewPassword: 'Подтвердите новый пароль',
    removePassword: 'Удалить пароль',
    removePasswordHint: 'Оставьте пустым для удаления защиты паролем',
    passwordChanged: 'Пароль успешно изменен',
    passwordRemoved: 'Защита паролем удалена',
    passwordAdded: 'Защита паролем добавлена',
    passwordProtectionUpdatedWithExceptions: 'Защита паролем обновлена с исключениями',
    passwordProtectionExceptionDescription:
      'Следующие файлы остаются зашифрованными на устройстве, но не защищены этим паролем дневника. Они также могут быть не защищены в синхронизированных резервных копиях:',
    dangerZone: 'Опасная зона',
    deleteJournal: 'Удалить дневник',
    deleteConfirmSecure: 'Введите пароль для удаления этого дневника',
    typeToDelete: "Введите 'delete {name}' для подтверждения",
    reencrypting: 'Повторное шифрование данных...',
    reencryptProgress: 'Обработка {current} из {total}...',
    themeOverride: 'Тема',
    useGlobalTheme: 'Использовать глобальную тему',
  },
  filterBar: {
    searchPlaceholder: 'Поиск...',
    from: 'С',
    to: 'По',
    clearFilters: 'Очистить',
    hasImage: 'Изображения',
    hasFile: 'Файлы',
    hasLocation: 'Местоположение',
    tags: 'Теги',
    filterBy: 'Фильтровать по',
    noTagsAvailable: 'Нет тегов в этом дневнике',
  },
  security: {
    title: 'Безопасность',
    keyStrength: 'Надежность ключа',
    kdfHint: 'Больше итераций замедляет разблокировку, но повышает безопасность',
    kdfExplainTitle: 'Что такое надежность ключа?',
    kdfExplainBody:
      'Когда вы устанавливаете пароль, ваш дневник шифруется ключом, полученным из него. Надежность ключа определяет, сколько итераций алгоритма PBKDF2 используется для получения этого ключа.\n\nБольше итераций значительно затрудняет взлом перебором, но также замедляет разблокировку — особенно на старых устройствах.\n\nДоступные уровни:\n• Быстрый — 50 000 итераций\n• Улучшенный — 100 000 итераций\n• Умеренный — 200 000 итераций\n• Сильный — 600 000 итераций\n• Отличный — 800 000 итераций\n• Экстрем — 1 000 000 итераций\n\nДля большинства пользователей «Быстрый» достаточно. Выберите уровень выше, если безопасность важнее скорости разблокировки.',
    kdf: {
      fast: 'Быстрый',
      improved: 'Улучшенный',
      moderate: 'Умеренный',
      strong: 'Сильный',
      great: 'Отличный',
      extreme: 'Экстрем',
    },
    autoLock: 'Автоблокировка',
    autoLockOff: 'Выкл',
    autoLock1m: '1 минута',
    autoLock5m: '5 минут',
    autoLock15m: '15 минут',
    autoLockTitle: 'Сессия заблокирована',
    autoLockMessage:
      'Ваша сессия была заблокирована из-за неактивности. Вы будете перенаправлены на главный экран.',
    rotateDeviceKey: 'Сменить ключ устройства',
    rotateExplain:
      'Ваши данные зашифрованы уникальным ключом, надежно хранящимся на этом устройстве. Смена ключа создает новый и повторно шифрует все дневники, страницы и вложения. Рекомендуется, если вы подозреваете, что ваше устройство было скомпрометировано. Процесс может занять от нескольких секунд до нескольких минут в зависимости от объема данных.',
    rotateWarning:
      'Все дневники, страницы и вложения будут повторно зашифрованы новым ключом. Для больших дневников это может занять несколько минут. Не закрывайте приложение до завершения процесса — прерывание может оставить данные в смешанном состоянии.',
    rotateConfirm: 'Сменить ключ',
    rotating: 'Смена ключа устройства...',
    rotateSuccess: 'Ключ устройства успешно сменен',
    doNotClose: 'Не закрывайте приложение',
  },
  backup: {
    export: 'Экспорт',
    import: 'Импорт',
    exportJournal: 'Экспортировать дневник',
    importFromBackup: 'Импортировать из резервной копии',
    includeEncryption: 'Включить шифрование',
    exporting: 'Экспорт...',
    exportComplete: 'Экспорт готов',
    exportError: 'Ошибка экспорта',
    importPassword: 'Эта резервная копия зашифрована. Введите пароль:',
    importConflict: 'Дневник с таким именем уже существует',
    importRename: 'Переименовать дневник',
    importSuccess: 'Дневник успешно импортирован',
    importError: 'Ошибка импорта',
    invalidFile: 'Недопустимый файл резервной копии',
    importing: 'Импорт...',
    or: 'ИЛИ',
  },
  sync: {
    sync: 'Синхронизация',
    syncNow: 'Синхронизировать сейчас',
    syncing: 'Синхронизация...',
    syncComplete: 'Синхронизация завершена',
    syncCheckpointed:
      'Синхронизация приостановлена для защиты памяти. Полностью закройте эту вкладку, снова откройте Canto и повторите синхронизацию.',
    syncDeferredAttachments: 'Некоторые большие устаревшие вложения не были синхронизированы',
    syncDeferredChunkGeneration:
      'Вложение использует старый формат частей и не было синхронизировано',
    syncDeferredAttachmentNotFound: 'Вложение не найдено в облачном хранилище',
    syncError: 'Ошибка синхронизации',
    passwordChangedElsewhere:
      'Пароль был изменён на другом устройстве. Отдельно сохраните все несинхронизированные локальные изменения, удалите этот локальный дневник, затем импортируйте его заново из Google Drive с новым паролем.',
    enableGDriveSync: 'Включить синхронизацию с Google Drive',
    disableSync: 'Отключить синхронизацию',
    autoSync: 'Автоматическая синхронизация',
    lastSynced: 'Последняя синхронизация',
    neverSynced: 'Никогда не синхронизировалось',
    notConfigured: 'Не настроено',
    signInToGoogle: 'Войти через Google',
    signedInAs: 'Вы вошли как',
    signOut: 'Выйти',
    importFromCloud: 'Импортировать из Google Drive',
    noCloudJournals: 'Журналы на Google Drive не найдены',
    preparingImport: 'Подготовка импорта...',
    journalAlreadyLocal: 'Уже на этом устройстве',
    connectAccount: 'Подключить аккаунт',
    account: 'Аккаунт',
    manageJournals: 'Управление дневниками',
    deleteRemoteJournal: 'Удалить из облака',
    deleteRemoteConfirm:
      'Это навсегда удалит этот дневник из Google Drive. Локальные копии не будут затронуты. Это действие нельзя отменить.',
    deleteRemoteSuccess: 'Дневник удален из облака',
    selectProvider: 'Выберите провайдер синхронизации',
    googleDrive: 'Google Drive',
    loggedInWith: 'Вход через {provider}',
    sessionRetention: 'Хранение сессии',
    retentionOneDay: '1 день',
    retentionOneWeek: '1 неделя',
    retentionOneMonth: '1 месяц',
    retentionNever: 'Не истекает',
  },
  onboarding: {
    welcomeTitle: 'Добро пожаловать в Canto',
    welcomeSubtitle: 'Ваш личный зашифрованный дневник.',
    encryptionTitle: 'Ваши записи зашифрованы',
    encryptionBody:
      'Canto использует шифрование AES-256. Ваши данные шифруются на вашем устройстве перед отправкой куда-либо.',
    privacyTitle: 'Без отслеживания. Без рекламы.\nБез сбора данных.',
    privacyBody:
      'Canto — открытый исходный код. Ваш дневник никогда не покидает ваше устройство, если вы сами не решите его синхронизировать.',
    getStartedTitle: 'Начните писать.',
    getStartedBody: 'Создайте свой первый дневник и начните вести записи конфиденциально.',
    getStartedButton: 'Начать',
    next: 'Далее',
    stepOf: '{step} из {total}',
  },
  a11y: {
    imageNofM: 'Изображение {n} из {m}',
    deleteImage: 'Удалить изображение',
    moveLeft: 'Переместить влево',
    moveRight: 'Переместить вправо',
    downloadImage: 'Скачать изображение',
    searchPages: 'Поиск страниц',
    clearSearch: 'Очистить поиск',
    filterButton: 'Фильтр',
    fileAttachment: 'Вложение файла',
    deleteFile: 'Удалить файл',
    pageEntry: 'Запись страницы',
  },
  help: {
    title: 'Помощь',
    body: 'Если вам нужна помощь или вы хотите сообщить об ошибке, посетите страницу проекта Canto на GitHub.',
    linkText: 'Открыть GitHub Issues',
  },
  changelog: {
    title: 'Changelog',
    dependenciesTab: 'Зависимости',
  },
  dataIntegrity: {
    syncWarningTitle: 'Предупреждение синхронизации',
    syncWarningDesc: '{failed} из {total} страниц не удалось загрузить.',
    syncSuggestion:
      'Проверьте подключение к интернету и попробуйте снова. Вы также можете сохранить частичный импорт и синхронизировать позже.',
    keepPartial: 'Сохранить частично',
    importWarningTitle: 'Предупреждение импорта',
    importWarningDesc: '{count} вложение(й) не удалось сохранить при импорте.',
    importSuggestion:
      'Журнал был импортирован, но некоторые вложения отсутствуют. Попробуйте импортировать снова из того же файла резервной копии.',
    failedItems: 'Неудачные элементы',
    retry: 'Повторить',
    acknowledge: 'OK',
  },
};

const zh: Dictionary = {
  app: {
    name: 'Canto',
    tagline: '您的私人日记',
  },
  common: {
    cancel: '取消',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    create: '创建',
    open: '打开',
    close: '关闭',
    search: '搜索',
    settings: '设置',
    loading: '加载中...',
    confirm: '确认',
    done: '完成',
    skip: '跳过',
  },
  home: {
    title: '日记本',
    newJournal: '新建日记本',
    noJournals: '还没有日记本。创建一个开始吧！',
    journalName: '日记本名称',
    selectIcon: '选择图标',
    password: '密码',
    confirmPassword: '确认密码',
    passwordMismatch: '密码不匹配',
    passwordOptional: '可选',
    wrongPassword: '密码错误',
    unlockJournal: '解锁日记本',
    passwordTooShort: '密码至少需要8个字符',
    tooManyAttempts: '尝试次数过多。请稍后再试。',
    passwordWarning: '没有密码恢复功能。如果忘记密码，数据将永久丢失。',
    biometricLock: '生物识别解锁',
    biometricReason: '验证身份以解锁日记本',
    biometricUnavailable: '此设备不支持生物识别认证',
    passwordExplainTitle: 'Canto 如何保护您的数据？',
    passwordExplainBody:
      '您的所有日记始终在此设备上使用存储在安全硬件中的唯一设备密钥进行加密。\n\n添加密码会在设备密钥之上提供额外的加密层。这意味着即使有人访问了您的设备文件，没有密码也无法读取您的日记。\n\n如果您选择不设置密码，您的数据仍然使用设备密钥加密——只是打开时不需要密码。',
    decrypting: '解密中...',
  },
  journal: {
    title: '页面',
    newPage: '新建页面',
    noPages: '还没有页面。创建第一个条目！',
    filter: '筛选',
    sort: '排序',
    anniversary: '周年纪念',
  },
  calendar: {
    titleSuffix: '日历',
    anniversaryRow: '今天有 {count} 个页面正在庆祝周年',
    anniversaryRowOne: '今天有 1 个页面正在庆祝周年',
    anniversaryRowZero: '今天没有周年纪念',
    noPages: '还没有页面',
  },
  page: {
    title: '页面',
    placeholder: '开始写作...',
    tags: '标签',
    attachments: '附件',
    comments: '评论',
    location: '位置',
    addImage: '图片',
    addEncryptedImage: '加密图片',
    addFile: '文件',
    addEncryptedFile: '加密文件',
    addLocation: '位置',
    addComment: '添加评论',
    addTag: '添加标签',
    newTag: '新标签...',
    noComments: '还没有评论',
    discardChanges: '放弃更改？',
    discardMessage: '您有未保存的更改。是否放弃？',
    discard: '放弃',
    keep: '继续编辑',
    deleteConfirm: '删除条目？',
    deleteMessage: '此条目将被永久删除。',
    locationCopied: '坐标已复制',
    decrypting: '解密中...',
    takePhoto: '拍照',
    takeEncryptedPhoto: '加密照片',
    cameraPermissionDenied: '相机权限被拒绝',
  },
  settings: {
    theme: '主题',
    language: '语言',
    darkMode: '深色模式',
    lightMode: '浅色模式',
    appearance: '外观',
    fontSize: '字体大小',
    fontFamily: '字体',
    fontSizeSmall: '小',
    fontSizeDefault: '默认',
    fontSizeLarge: '大',
    fontSizeXLarge: '特大',
    fontFamilyDefault: '默认',
    fontFamilyDyslexic: 'OpenDyslexic',
    fontFamilySerif: '衬线',
  },
  passwordStrength: {
    weak: '弱',
    fair: '一般',
    strong: '强',
    min8: '8+字符',
    min12: '12+字符',
    lowercase: '小写字母',
    uppercase: '大写字母',
    digit: '数字',
    special: '特殊字符',
  },
  journalSettings: {
    title: '日记本设置',
    stats: '统计',
    pageCount: '已创建页面',
    createdOn: '创建于',
    displaySettings: '显示',
    use24h: '24小时制',
    previewTags: '在预览中显示标签',
    previewThumbnail: '在预览中显示缩略图',
    previewIcons: '在预览中显示内容图标',
    filterBarToggle: '显示筛选栏',
    autoLocation: '自动添加位置',
    sortOrder: '排序方式',
    ascending: '最旧优先',
    descending: '最新优先',
    none: '不排序',
    changeIcon: '更改图标',
    changeName: '更改名称',
    newName: '新名称',
    changePassword: '更改密码',
    currentPassword: '当前密码',
    newPassword: '新密码',
    confirmNewPassword: '确认新密码',
    removePassword: '移除密码',
    removePasswordHint: '留空以移除密码保护',
    passwordChanged: '密码修改成功',
    passwordRemoved: '密码保护已移除',
    passwordAdded: '密码保护已添加',
    passwordProtectionUpdatedWithExceptions: '密码保护已更新，但有例外',
    passwordProtectionExceptionDescription:
      '以下文件仍在设备上加密，但不受此日记密码保护。它们在同步备份中也可能不受保护：',
    dangerZone: '危险区域',
    deleteJournal: '删除日记本',
    deleteConfirmSecure: '输入密码以删除此日记本',
    typeToDelete: "输入 'delete {name}' 确认",
    reencrypting: '重新加密数据...',
    reencryptProgress: '处理 {current}/{total}...',
    themeOverride: '主题',
    useGlobalTheme: '使用全局主题',
  },
  filterBar: {
    searchPlaceholder: '搜索...',
    from: '从',
    to: '到',
    clearFilters: '清除',
    hasImage: '图片',
    hasFile: '文件',
    hasLocation: '位置',
    tags: '标签',
    filterBy: '筛选条件',
    noTagsAvailable: '此日记本没有标签',
  },
  security: {
    title: '安全',
    keyStrength: '密钥强度',
    kdfHint: '更多迭代会减慢解锁速度，但更难破解',
    kdfExplainTitle: '什么是密钥强度？',
    kdfExplainBody:
      '当您设置密码时，您的日记会使用从密码派生的密钥进行加密。密钥强度控制使用 PBKDF2 算法的迭代次数来派生此密钥。\n\n更多的迭代使密钥更难被暴力破解，但也会使解锁变慢——尤其是在较旧的设备上。\n\n可用级别：\n• 快速 — 50,000 次迭代\n• 改进 — 100,000 次迭代\n• 中等 — 200,000 次迭代\n• 强 — 600,000 次迭代\n• 很强 — 800,000 次迭代\n• 极限 — 1,000,000 次迭代\n\n对于大多数用户，"快速"已经足够。如果您优先考虑安全性，请选择更高级别。',
    kdf: {
      fast: '快速',
      improved: '改进',
      moderate: '中等',
      strong: '强',
      great: '很强',
      extreme: '极限',
    },
    autoLock: '自动锁定',
    autoLockOff: '关闭',
    autoLock1m: '1分钟',
    autoLock5m: '5分钟',
    autoLock15m: '15分钟',
    autoLockTitle: '会话已锁定',
    autoLockMessage: '由于长时间未操作，您的会话已被锁定。您将被重定向到主屏幕。',
    rotateDeviceKey: '轮换设备密钥',
    rotateExplain:
      '您的数据使用安全存储在此设备上的唯一密钥进行加密。轮换密钥会生成新密钥并重新加密所有日记、页面和附件。如果您怀疑设备已被入侵，建议执行此操作。根据数据量，此过程可能需要几秒到几分钟。',
    rotateWarning:
      '所有日记、页面和附件将使用新密钥重新加密。大型日记可能需要几分钟。请勿在处理完成前关闭应用——中断可能导致数据处于混合状态。',
    rotateConfirm: '轮换密钥',
    rotating: '正在轮换设备密钥...',
    rotateSuccess: '设备密钥轮换成功',
    doNotClose: '请勿关闭应用',
  },
  backup: {
    export: '导出',
    import: '导入',
    exportJournal: '导出日记',
    importFromBackup: '从备份导入',
    includeEncryption: '包含加密',
    exporting: '正在导出...',
    exportComplete: '导出完成',
    exportError: '导出失败',
    importPassword: '此备份已加密。请输入密码：',
    importConflict: '已存在同名日记',
    importRename: '重命名日记',
    importSuccess: '日记导入成功',
    importError: '导入失败',
    invalidFile: '无效的备份文件',
    importing: '正在导入...',
    or: '或',
  },
  sync: {
    sync: '同步',
    syncNow: '立即同步',
    syncing: '同步中...',
    syncComplete: '同步完成',
    syncCheckpointed: '为保护内存，同步已暂停。请完全关闭此标签页，重新打开 Canto，然后再次同步。',
    syncDeferredAttachments: '部分大型旧附件未同步',
    syncDeferredChunkGeneration: '附件使用较旧的分块格式，未同步',
    syncDeferredAttachmentNotFound: '未在云存储中找到附件',
    syncError: '同步失败',
    passwordChangedElsewhere:
      '密码已在另一台设备上更改。请先单独保存所有未同步的本地更改，删除此本地日记，然后使用新密码从 Google Drive 重新导入。',
    enableGDriveSync: '启用Google Drive同步',
    disableSync: '禁用同步',
    autoSync: '自动同步',
    lastSynced: '上次同步',
    neverSynced: '从未同步',
    notConfigured: '未配置',
    signInToGoogle: '登录Google',
    signedInAs: '已登录为',
    signOut: '退出登录',
    importFromCloud: '从Google Drive导入',
    noCloudJournals: 'Google Drive上未找到日记',
    preparingImport: '正在准备导入...',
    journalAlreadyLocal: '已在此设备上',
    connectAccount: '连接账户',
    account: '账户',
    manageJournals: '管理日记',
    deleteRemoteJournal: '从云端删除',
    deleteRemoteConfirm:
      '这将永久删除Google Drive上的此日记。本地副本不会受到影响。此操作无法撤消。',
    deleteRemoteSuccess: '日记已从云端删除',
    selectProvider: '选择同步提供商',
    googleDrive: 'Google Drive',
    loggedInWith: '已通过 {provider} 登录',
    sessionRetention: '会话保留',
    retentionOneDay: '1 天',
    retentionOneWeek: '1 周',
    retentionOneMonth: '1 个月',
    retentionNever: '永不过期',
  },
  onboarding: {
    welcomeTitle: '欢迎使用 Canto',
    welcomeSubtitle: '您的私密加密日记。',
    encryptionTitle: '您的日记条目已加密',
    encryptionBody: 'Canto 使用 AES-256 加密。您的数据在离开设备之前就已在本地加密。',
    privacyTitle: '无追踪。无广告。\n无数据收集。',
    privacyBody: 'Canto 是开源的。除非您选择同步，否则您的日记永远不会离开您的设备。',
    getStartedTitle: '开始写作。',
    getStartedBody: '创建您的第一本日记，开始私密写作。',
    getStartedButton: '开始使用',
    next: '下一步',
    stepOf: '第 {step} 步，共 {total} 步',
  },
  a11y: {
    imageNofM: '图片 {n}/{m}',
    deleteImage: '删除图片',
    moveLeft: '向左移动',
    moveRight: '向右移动',
    downloadImage: '下载图片',
    searchPages: '搜索页面',
    clearSearch: '清除搜索',
    filterButton: '筛选',
    fileAttachment: '文件附件',
    deleteFile: '删除文件',
    pageEntry: '页面条目',
  },
  help: {
    title: '帮助',
    body: '如果您需要帮助或想要报告错误，请访问 GitHub 上的 Canto 项目页面。',
    linkText: '打开 GitHub Issues',
  },
  changelog: {
    title: '更新日志',
    dependenciesTab: '依赖项',
  },
  dataIntegrity: {
    syncWarningTitle: '同步警告',
    syncWarningDesc: '{total} 个页面中有 {failed} 个无法下载。',
    syncSuggestion: '请检查您的网络连接并重试。您也可以保留部分导入，稍后重新同步。',
    keepPartial: '保留部分',
    importWarningTitle: '导入警告',
    importWarningDesc: '导入过程中有 {count} 个附件无法保存。',
    importSuggestion: '日记已导入，但某些附件缺失。请尝试从相同的备份文件重新导入以恢复它们。',
    failedItems: '失败项目',
    retry: '重试',
    acknowledge: '确定',
  },
};

const it: Dictionary = {
  app: {
    name: 'Canto',
    tagline: 'Il tuo diario privato',
  },
  common: {
    cancel: 'Annulla',
    save: 'Salva',
    delete: 'Elimina',
    edit: 'Modifica',
    create: 'Crea',
    open: 'Apri',
    close: 'Chiudi',
    search: 'Cerca',
    settings: 'Impostazioni',
    loading: 'Caricamento...',
    confirm: 'Conferma',
    done: 'Fatto',
    skip: 'Salta',
  },
  home: {
    title: 'Diari',
    newJournal: 'Nuovo Diario',
    noJournals: 'Nessun diario ancora. Creane uno per iniziare!',
    journalName: 'Nome del diario',
    selectIcon: 'Seleziona icona',
    password: 'Password',
    confirmPassword: 'Conferma password',
    passwordMismatch: 'Le password non corrispondono',
    passwordOptional: 'Opzionale',
    wrongPassword: 'Password errata',
    unlockJournal: 'Sblocca Diario',
    passwordTooShort: 'La password deve avere almeno 8 caratteri',
    tooManyAttempts: 'Troppi tentativi. Riprova piu tardi.',
    passwordWarning:
      'Non esiste recupero della password. Se dimentichi la password, i tuoi dati andranno persi definitivamente.',
    biometricLock: 'Sblocco biometrico',
    biometricReason: 'Autenticati per sbloccare il diario',
    biometricUnavailable: "L'autenticazione biometrica non e disponibile su questo dispositivo",
    passwordExplainTitle: 'Come protegge Canto i tuoi dati?',
    passwordExplainBody:
      "Tutti i tuoi diari sono sempre cifrati su questo dispositivo con una chiave unica memorizzata nell'hardware sicuro.\n\nAggiungere una password fornisce un ulteriore livello di cifratura sopra la chiave del dispositivo. Questo significa che anche se qualcuno accede ai file del tuo dispositivo, non potra leggere il tuo diario senza la password.\n\nSe scegli di non impostare una password, i tuoi dati sono comunque cifrati con la chiave del dispositivo — semplicemente non sara richiesta una password per aprirlo.",
    decrypting: 'Decifratura...',
  },
  journal: {
    title: 'Pagine',
    newPage: 'Nuova Pagina',
    noPages: 'Nessuna pagina ancora. Crea la tua prima voce!',
    filter: 'Filtra',
    sort: 'Ordina',
    anniversary: 'Anniversario',
  },
  calendar: {
    titleSuffix: 'Calendario',
    anniversaryRow: '{count} pagine celebrano un anniversario oggi',
    anniversaryRowOne: '1 pagina celebra un anniversario oggi',
    anniversaryRowZero: 'Nessun anniversario oggi',
    noPages: 'Nessuna pagina ancora',
  },
  page: {
    title: 'Pagina',
    placeholder: 'Inizia a scrivere...',
    tags: 'Tag',
    attachments: 'Allegati',
    comments: 'Commenti',
    location: 'Posizione',
    addImage: 'Immagine',
    addEncryptedImage: 'Immagine Cifrata',
    addFile: 'File',
    addEncryptedFile: 'File Cifrato',
    addLocation: 'Posizione',
    addComment: 'Aggiungi commento',
    addTag: 'Aggiungi tag',
    newTag: 'Nuovo tag...',
    noComments: 'Nessun commento ancora',
    discardChanges: 'Annullare le modifiche?',
    discardMessage: 'Hai modifiche non salvate. Annullarle?',
    discard: 'Annulla',
    keep: 'Continua a modificare',
    deleteConfirm: 'Eliminare la voce?',
    deleteMessage: 'Questa voce verra eliminata definitivamente.',
    locationCopied: 'Coordinate copiate',
    decrypting: 'Decifratura...',
    takePhoto: 'Scatta Foto',
    takeEncryptedPhoto: 'Foto Crittografata',
    cameraPermissionDenied: 'Permesso fotocamera negato',
  },
  settings: {
    theme: 'Tema',
    language: 'Lingua',
    darkMode: 'Modalita Scura',
    lightMode: 'Modalita Chiara',
    appearance: 'Aspetto',
    fontSize: 'Dimensione del carattere',
    fontFamily: 'Famiglia del carattere',
    fontSizeSmall: 'Piccolo',
    fontSizeDefault: 'Predefinito',
    fontSizeLarge: 'Grande',
    fontSizeXLarge: 'Molto grande',
    fontFamilyDefault: 'Predefinito',
    fontFamilyDyslexic: 'OpenDyslexic',
    fontFamilySerif: 'Serif',
  },
  passwordStrength: {
    weak: 'Debole',
    fair: 'Discreto',
    strong: 'Forte',
    min8: '8+ caratteri',
    min12: '12+ caratteri',
    lowercase: 'lettera minuscola',
    uppercase: 'lettera maiuscola',
    digit: 'numero',
    special: 'carattere speciale',
  },
  journalSettings: {
    title: 'Impostazioni del Diario',
    stats: 'Statistiche',
    pageCount: 'Pagine create',
    createdOn: 'Creato il',
    displaySettings: 'Visualizzazione',
    use24h: 'Formato 24 ore',
    previewTags: "Mostra tag nell'anteprima",
    previewThumbnail: "Mostra miniatura nell'anteprima",
    previewIcons: "Mostra icone contenuto nell'anteprima",
    filterBarToggle: 'Mostra barra dei filtri',
    autoLocation: 'Aggiungi posizione automaticamente',
    sortOrder: 'Ordine di ordinamento',
    ascending: 'Piu vecchi prima',
    descending: 'Piu recenti prima',
    none: 'Nessun ordinamento',
    changeIcon: 'Cambia icona',
    changeName: 'Cambia nome',
    newName: 'Nuovo nome',
    changePassword: 'Cambia password',
    currentPassword: 'Password attuale',
    newPassword: 'Nuova password',
    confirmNewPassword: 'Conferma nuova password',
    removePassword: 'Rimuovi password',
    removePasswordHint: 'Lascia vuoto per rimuovere la protezione con password',
    passwordChanged: 'Password modificata con successo',
    passwordRemoved: 'Protezione con password rimossa',
    passwordAdded: 'Protezione con password aggiunta',
    passwordProtectionUpdatedWithExceptions: 'Protezione con password aggiornata con eccezioni',
    passwordProtectionExceptionDescription:
      'I seguenti file rimangono crittografati sul dispositivo, ma non sono protetti da questa password del diario. Potrebbero inoltre non essere protetti nei backup sincronizzati:',
    dangerZone: 'Zona pericolosa',
    deleteJournal: 'Elimina diario',
    deleteConfirmSecure: 'Inserisci la password per eliminare questo diario',
    typeToDelete: "Digita 'delete {name}' per confermare",
    reencrypting: 'Ri-cifratura dei dati...',
    reencryptProgress: 'Elaborazione {current} di {total}...',
    themeOverride: 'Tema',
    useGlobalTheme: 'Usa tema globale',
  },
  filterBar: {
    searchPlaceholder: 'Cerca...',
    from: 'Da',
    to: 'A',
    clearFilters: 'Cancella',
    hasImage: 'Immagini',
    hasFile: 'File',
    hasLocation: 'Posizione',
    tags: 'Tag',
    filterBy: 'Filtra per',
    noTagsAvailable: 'Nessun tag in questo diario',
  },
  security: {
    title: 'Sicurezza',
    keyStrength: 'Forza della chiave',
    kdfHint: 'Piu iterazioni rallentano lo sblocco ma aumentano la sicurezza',
    kdfExplainTitle: "Cos'e la forza della chiave?",
    kdfExplainBody:
      'Quando imposti una password, il tuo diario viene cifrato con una chiave derivata da essa. La forza della chiave controlla quante iterazioni dell\'algoritmo PBKDF2 vengono utilizzate per derivare questa chiave.\n\nPiu iterazioni rendono la chiave molto piu difficile da violare con attacchi di forza bruta, ma rallentano anche lo sblocco — specialmente su dispositivi piu vecchi.\n\nLivelli disponibili:\n• Veloce — 50.000 iterazioni\n• Migliorato — 100.000 iterazioni\n• Moderato — 200.000 iterazioni\n• Forte — 600.000 iterazioni\n• Ottimo — 800.000 iterazioni\n• Estremo — 1.000.000 iterazioni\n\nPer la maggior parte degli utenti, "Veloce" e sufficiente. Scegli un livello piu alto se la sicurezza e prioritaria.',
    kdf: {
      fast: 'Veloce',
      improved: 'Migliorato',
      moderate: 'Moderato',
      strong: 'Forte',
      great: 'Ottimo',
      extreme: 'Estremo',
    },
    autoLock: 'Blocco automatico',
    autoLockOff: 'Disattivato',
    autoLock1m: '1 minuto',
    autoLock5m: '5 minuti',
    autoLock15m: '15 minuti',
    autoLockTitle: 'Sessione bloccata',
    autoLockMessage:
      'La sessione è stata bloccata per inattività. Verrai reindirizzato alla schermata principale.',
    rotateDeviceKey: 'Ruota chiave del dispositivo',
    rotateExplain:
      'I tuoi dati sono cifrati con una chiave unica memorizzata in modo sicuro su questo dispositivo. Ruotare la chiave ne genera una nuova e ri-cifra tutti i diari, le pagine e gli allegati. Consigliato se sospetti che il tuo dispositivo sia stato compromesso. Il processo puo richiedere da pochi secondi a diversi minuti a seconda della quantita di dati.',
    rotateWarning:
      "Tutti i diari, le pagine e gli allegati verranno ri-cifrati con una nuova chiave. Per diari di grandi dimensioni potrebbe richiedere diversi minuti. Non chiudere l'app fino al completamento — l'interruzione potrebbe lasciare i dati in uno stato misto.",
    rotateConfirm: 'Ruota chiave',
    rotating: 'Rotazione della chiave del dispositivo...',
    rotateSuccess: 'Chiave del dispositivo ruotata con successo',
    doNotClose: "Non chiudere l'applicazione",
  },
  backup: {
    export: 'Esporta',
    import: 'Importa',
    exportJournal: 'Esporta diario',
    importFromBackup: 'Importa da backup',
    includeEncryption: 'Includi crittografia',
    exporting: 'Esportazione...',
    exportComplete: 'Esportazione pronta',
    exportError: 'Esportazione fallita',
    importPassword: 'Questo backup e crittografato. Inserisci la password:',
    importConflict: 'Un diario con questo nome esiste gia',
    importRename: 'Rinomina diario',
    importSuccess: 'Diario importato con successo',
    importError: 'Importazione fallita',
    invalidFile: 'File di backup non valido',
    importing: 'Importazione...',
    or: 'O',
  },
  sync: {
    sync: 'Sincronizza',
    syncNow: 'Sincronizza ora',
    syncing: 'Sincronizzazione...',
    syncComplete: 'Sincronizzazione completata',
    syncCheckpointed:
      'Sincronizzazione sospesa per proteggere la memoria. Chiudi completamente questa scheda, riapri Canto e sincronizza di nuovo.',
    syncDeferredAttachments:
      'Alcuni allegati legacy di grandi dimensioni non sono stati sincronizzati',
    syncDeferredChunkGeneration:
      "L'allegato usa un vecchio formato a blocchi e non è stato sincronizzato",
    syncDeferredAttachmentNotFound: "L'allegato non è stato trovato nell'archivio cloud",
    syncError: 'Sincronizzazione fallita',
    passwordChangedElsewhere:
      'La password è stata modificata su un altro dispositivo. Salva separatamente le modifiche locali non sincronizzate, rimuovi questo diario locale e poi importalo di nuovo da Google Drive usando la nuova password.',
    enableGDriveSync: 'Attiva sincronizzazione Google Drive',
    disableSync: 'Disattiva sincronizzazione',
    autoSync: 'Sincronizzazione automatica',
    lastSynced: 'Ultima sincronizzazione',
    neverSynced: 'Mai sincronizzato',
    notConfigured: 'Non configurato',
    signInToGoogle: 'Accedi con Google',
    signedInAs: 'Connesso come',
    signOut: 'Esci',
    importFromCloud: 'Importa da Google Drive',
    noCloudJournals: 'Nessun diario trovato su Google Drive',
    preparingImport: 'Preparazione importazione...',
    journalAlreadyLocal: 'Gia su questo dispositivo',
    connectAccount: 'Connetti account',
    account: 'Account',
    manageJournals: 'Gestisci diari',
    deleteRemoteJournal: 'Elimina dal cloud',
    deleteRemoteConfirm:
      'Questo eliminera permanentemente questo diario da Google Drive. Le copie locali non saranno interessate. Questa azione non puo essere annullata.',
    deleteRemoteSuccess: 'Diario eliminato dal cloud',
    selectProvider: 'Seleziona provider di sincronizzazione',
    googleDrive: 'Google Drive',
    loggedInWith: 'Connesso con {provider}',
    sessionRetention: 'Conservazione sessione',
    retentionOneDay: '1 giorno',
    retentionOneWeek: '1 settimana',
    retentionOneMonth: '1 mese',
    retentionNever: 'Non scade mai',
  },
  onboarding: {
    welcomeTitle: 'Benvenuto su Canto',
    welcomeSubtitle: 'Il tuo diario privato e crittografato.',
    encryptionTitle: 'Le tue voci sono crittografate',
    encryptionBody:
      'Canto utilizza la crittografia AES-256. I tuoi dati vengono crittografati sul dispositivo prima di andare ovunque.',
    privacyTitle: 'Nessun tracciamento. Nessuna pubblicita.\nNessuna raccolta dati.',
    privacyBody:
      'Canto e open source. Il tuo diario non lascia mai il tuo dispositivo a meno che tu non scelga di sincronizzarlo.',
    getStartedTitle: 'Inizia a scrivere.',
    getStartedBody: 'Crea il tuo primo diario e inizia a scrivere in privato.',
    getStartedButton: 'Inizia',
    next: 'Avanti',
    stepOf: '{step} di {total}',
  },
  a11y: {
    imageNofM: 'Immagine {n} di {m}',
    deleteImage: 'Elimina immagine',
    moveLeft: 'Sposta a sinistra',
    moveRight: 'Sposta a destra',
    downloadImage: 'Scarica immagine',
    searchPages: 'Cerca pagine',
    clearSearch: 'Cancella ricerca',
    filterButton: 'Filtra',
    fileAttachment: 'Allegato file',
    deleteFile: 'Elimina file',
    pageEntry: 'Voce della pagina',
  },
  help: {
    title: 'Aiuto',
    body: 'Se hai bisogno di aiuto o vuoi segnalare un bug, visita la pagina del progetto Canto su GitHub.',
    linkText: 'Apri GitHub Issues',
  },
  changelog: {
    title: 'Changelog',
    dependenciesTab: 'Dipendenze',
  },
  dataIntegrity: {
    syncWarningTitle: 'Avviso di sincronizzazione',
    syncWarningDesc: '{failed} di {total} pagine non sono state scaricate.',
    syncSuggestion:
      "Controlla la connessione a Internet e riprova. Puoi anche mantenere l'importazione parziale e risincronizzare in seguito.",
    keepPartial: 'Mantieni parziale',
    importWarningTitle: 'Avviso di importazione',
    importWarningDesc: "{count} allegato/i non sono stati salvati durante l'importazione.",
    importSuggestion:
      'Il diario e stato importato ma mancano alcuni allegati. Prova a importare di nuovo dallo stesso file di backup per recuperarli.',
    failedItems: 'Elementi falliti',
    retry: 'Riprova',
    acknowledge: 'OK',
  },
};

// New languages imported from separate modules
import { ja, ko, ar, hi, tr, nl } from './new-langs-1';
import { pl, sv, vi, th, id, uk } from './new-langs-2';

export const dictionaries: Record<LangCode, Dictionary> = {
  en,
  pt,
  es,
  de,
  fr,
  ru,
  zh,
  it,
  ja,
  ko,
  ar,
  hi,
  tr,
  nl,
  pl,
  sv,
  vi,
  th,
  id,
  uk,
};

export const langCodes: LangCode[] = [
  'en',
  'pt',
  'es',
  'de',
  'fr',
  'ru',
  'zh',
  'it',
  'ja',
  'ko',
  'ar',
  'hi',
  'tr',
  'nl',
  'pl',
  'sv',
  'vi',
  'th',
  'id',
  'uk',
];

export const langNativeNames: Record<LangCode, string> = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  ru: 'Русский',
  zh: '中文',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  ar: 'العربية',
  hi: 'हिन्दी',
  tr: 'Türkçe',
  nl: 'Nederlands',
  pl: 'Polski',
  sv: 'Svenska',
  vi: 'Tiếng Việt',
  th: 'ไทย',
  id: 'Bahasa Indonesia',
  uk: 'Українська',
};
