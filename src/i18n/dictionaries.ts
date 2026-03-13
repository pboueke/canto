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
};

export const dictionaries: Record<LangCode, Dictionary> = { en, pt };
