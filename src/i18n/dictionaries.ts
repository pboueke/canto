export type LangCode = 'en' | 'pt';

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
  };
  journal: {
    title: string;
    newPage: string;
    noPages: string;
    filter: string;
    sort: string;
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
  };
  settings: {
    theme: string;
    language: string;
    darkMode: string;
    lightMode: string;
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
    showMarkdownPlaceholder: string;
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
    dangerZone: string;
    deleteJournal: string;
    deleteConfirmSecure: string;
    typeToDelete: string;
    reencrypting: string;
    reencryptProgress: string;
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
    passwordOptional: 'Optional — leave blank for no encryption',
    wrongPassword: 'Wrong password',
    unlockJournal: 'Unlock Journal',
    passwordTooShort: 'Password must be at least 8 characters',
    tooManyAttempts: 'Too many attempts. Try again later.',
    passwordWarning:
      'There is no password recovery. If you forget your password, your data will be permanently lost.',
    biometricLock: 'Biometric unlock',
    biometricReason: 'Authenticate to unlock journal',
    biometricUnavailable: 'Biometric authentication is not available on this device',
  },
  journal: {
    title: 'Pages',
    newPage: 'New Page',
    noPages: 'No pages yet. Create your first entry!',
    filter: 'Filter',
    sort: 'Sort',
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
  },
  settings: {
    theme: 'Theme',
    language: 'Language',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
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
    showMarkdownPlaceholder: 'Show markdown tips',
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
    dangerZone: 'Danger zone',
    deleteJournal: 'Delete journal',
    deleteConfirmSecure: 'Enter your password to delete this journal',
    typeToDelete: "Type 'delete {name}' to confirm",
    reencrypting: 'Re-encrypting data...',
    reencryptProgress: 'Processing {current} of {total}...',
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
};

const pt: Dictionary = {
  app: {
    name: 'Canto',
    tagline: 'Seu diario privado',
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
    settings: 'Configuracoes',
    loading: 'Carregando...',
    confirm: 'Confirmar',
    done: 'Pronto',
  },
  home: {
    title: 'Diarios',
    newJournal: 'Novo Diario',
    noJournals: 'Nenhum diario ainda. Crie um para comecar!',
    journalName: 'Nome do diario',
    selectIcon: 'Selecionar icone',
    password: 'Senha',
    confirmPassword: 'Confirmar senha',
    passwordMismatch: 'As senhas nao coincidem',
    passwordOptional: 'Opcional — deixe em branco para nao criptografar',
    wrongPassword: 'Senha incorreta',
    unlockJournal: 'Desbloquear Diario',
    passwordTooShort: 'A senha deve ter pelo menos 8 caracteres',
    tooManyAttempts: 'Muitas tentativas. Tente novamente mais tarde.',
    passwordWarning:
      'Nao ha recuperacao de senha. Se voce esquecer sua senha, seus dados serao permanentemente perdidos.',
    biometricLock: 'Desbloqueio biometrico',
    biometricReason: 'Autentique-se para desbloquear o diario',
    biometricUnavailable: 'Autenticacao biometrica nao esta disponivel neste dispositivo',
  },
  journal: {
    title: 'Paginas',
    newPage: 'Nova Pagina',
    noPages: 'Nenhuma pagina ainda. Crie sua primeira entrada!',
    filter: 'Filtrar',
    sort: 'Ordenar',
  },
  page: {
    title: 'Pagina',
    placeholder: 'Comece a escrever...',
    tags: 'Tags',
    attachments: 'Anexos',
    comments: 'Comentarios',
    location: 'Localizacao',
    addImage: 'Imagem',
    addEncryptedImage: 'Imagem Criptografada',
    addFile: 'Arquivo',
    addEncryptedFile: 'Arquivo Criptografado',
    addLocation: 'Localizacao',
    addComment: 'Adicionar comentario',
    addTag: 'Adicionar tag',
    newTag: 'Nova tag...',
    noComments: 'Sem comentarios ainda',
    discardChanges: 'Descartar alteracoes?',
    discardMessage: 'Voce tem alteracoes nao salvas. Descartar?',
    discard: 'Descartar',
    keep: 'Continuar editando',
    deleteConfirm: 'Excluir entrada?',
    deleteMessage: 'Esta entrada sera excluida permanentemente.',
    locationCopied: 'Coordenadas copiadas',
    decrypting: 'Descriptografando...',
  },
  settings: {
    theme: 'Tema',
    language: 'Idioma',
    darkMode: 'Modo Escuro',
    lightMode: 'Modo Claro',
  },
  passwordStrength: {
    weak: 'Fraca',
    fair: 'Razoavel',
    strong: 'Forte',
    min8: '8+ caracteres',
    min12: '12+ caracteres',
    lowercase: 'letra minuscula',
    uppercase: 'letra maiuscula',
    digit: 'numero',
    special: 'caractere especial',
  },
  journalSettings: {
    title: 'Configuracoes do Diario',
    stats: 'Estatisticas',
    pageCount: 'Paginas criadas',
    createdOn: 'Criado em',
    displaySettings: 'Exibicao',
    use24h: 'Horario 24 horas',
    previewTags: 'Mostrar tags na previa',
    previewThumbnail: 'Mostrar miniatura na previa',
    previewIcons: 'Mostrar icones de conteudo na previa',
    filterBarToggle: 'Mostrar barra de filtros',
    showMarkdownPlaceholder: 'Mostrar dicas de markdown',
    autoLocation: 'Adicionar localizacao automaticamente',
    sortOrder: 'Ordem de classificacao',
    ascending: 'Mais antigos primeiro',
    descending: 'Mais recentes primeiro',
    none: 'Sem ordenacao',
    changeIcon: 'Alterar icone',
    changeName: 'Alterar nome',
    newName: 'Novo nome',
    changePassword: 'Alterar senha',
    currentPassword: 'Senha atual',
    newPassword: 'Nova senha',
    confirmNewPassword: 'Confirmar nova senha',
    removePassword: 'Remover senha',
    removePasswordHint: 'Deixe em branco para remover a protecao por senha',
    passwordChanged: 'Senha alterada com sucesso',
    passwordRemoved: 'Protecao por senha removida',
    passwordAdded: 'Protecao por senha adicionada',
    dangerZone: 'Zona de perigo',
    deleteJournal: 'Excluir diario',
    deleteConfirmSecure: 'Digite sua senha para excluir este diario',
    typeToDelete: "Digite 'delete {name}' para confirmar",
    reencrypting: 'Re-criptografando dados...',
    reencryptProgress: 'Processando {current} de {total}...',
  },
  filterBar: {
    searchPlaceholder: 'Buscar...',
    from: 'De',
    to: 'Ate',
    clearFilters: 'Limpar',
    hasImage: 'Imagens',
    hasFile: 'Arquivos',
    hasLocation: 'Localizacao',
    tags: 'Tags',
    filterBy: 'Filtrar por',
    noTagsAvailable: 'Nenhuma tag neste diario',
  },
};

export const dictionaries: Record<LangCode, Dictionary> = { en, pt };
