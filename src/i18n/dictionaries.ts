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
  },
  settings: {
    theme: 'Tema',
    language: 'Idioma',
    darkMode: 'Modo Escuro',
    lightMode: 'Modo Claro',
  },
};

export const dictionaries: Record<LangCode, Dictionary> = { en, pt };
