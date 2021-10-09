/* eslint quote-props: "off" */

const text = {
  'en': {
    pt: 'pt',
  },
  'Switch theme': {
    pt: 'Trocar de tema',
  },
  'About Canto': {
    pt: 'Sobre o Canto',
  },
  'Version': {
    pt: 'Versão',
  },
  'Cancel': {
    pt: 'Cancelar',
  },
  'Open': {
    pt: 'Abrir',
  },
  'Password': {
    pt: 'Senha',
  },
  'Wrong Password': {
    pt: 'Senha errada',
  },
  'Confirm password (you can´t change it later)': {
    pt: 'Confirme a senha (você não poderá mudá-la)',
  },
  'About Canto': {
    pt: 'Sobre o Canto',
  },
  'Select a Journal or create a new one': {
    pt: 'Selecione um diário ou crie um novo',
  },
  'Create a new Journal?': {
    pt: 'Criar um novo diário?',
  },
  'Title': {
    pt: 'Título',
  },
  'Password (leave empty for none)': {
    pt: 'Senha (deixe vazio para não usar)',
  },
  'click to change icon': {
    pt: 'toque para mudar o ícone',
  },
  'Create': {
    pt: 'Criar',
  },
  'My Journal': {
    pt: 'Meu Diário',
  },
  'search filter': {
    pt: 'busca textual',
  },
  'Change filters': {
    pt: 'Alterar filtros',
  },
  'must have': {
    pt: 'necessário ter',
  },
  'Image': {
    pt: 'Imagem',
  },
  'File': {
    pt: 'Arquivo',
  },
  'Location': {
    pt: 'Local',
  },
  'Selected Tags': {
    pt: 'Tags selecionados',
  },
  'Available Tags': {
    pt: 'Tags disponíveis',
  },
  'remove': {
    pt: 'remover',
  },
  'add': {
    pt: 'adicionar',
  },
  'Settings': {
    pt: 'Configurações',
  },
  'page': {
    pt: 'página',
  },
  'created': {
    pt: 'criada(s)',
  },
  'since': {
    pt: 'desde',
  },
  'Use 24h format': {
    pt: 'Usar formato de tempo com 24h',
  },
  'Show tags on page listing': {
    pt: 'Mostrar tags das páginas',
  },
  'Show thumbnail on page listing': {
    pt: 'Mostar imagem das páginas',
  },
  'Show content indicators on page listing': {
    pt: 'Mostrar indicadores de conteúdo das páginas',
  },
  'Enable the journal filter bar': {
    pt: 'Habilitar barra de filtros',
  },
  'Page list sort method by date': {
    pt: 'Método de ordenação temporal das páginas',
  },
  'ascending': {
    pt: 'mais novos',
  },
  'descending': {
    pt: 'mais velhos',
  },
  'none': {
    pt: 'nenhum',
  },
  'Discard changes?': {
    pt: 'Descartar alterações?',
  },
  'You have unsaved changes. Are you sure to discard them and leave?': {
    pt: 'Você tem alterações não salvas. Tem ceteza que deseja descartá-las?',
  },
  "Don't leave": {
    pt: 'Não sair',
  },
  'Discard': {
    pt: 'Descartar',
  },
  'saving image...': {
    pt: 'Sobre o Canto',
  },
  "to 'Canto' image folder": {
    pt: "para a pasta de imagens 'Canto'",
  },
  'Image saved!': {
    pt: 'Imagem Salva!',
  },
  'Could not save image :s': {
    pt: 'Não foi possível salvar a imagem :s',
  },
  'Are you sure to delete this page?': {
    pt: 'Tem certeza que quer deletar essa página?',
  },
  'Please write the text below to confirm deletion': {
    pt: 'Por favor escreva o texto abaixo para confirmar a delećão',
  },
  'Delete': {
    pt: 'Deletar',
  },
  'Edit/add a': {
    pt: 'Edit/add uma',
  },
  'Tag': {
    pt: 'Tag',
  },
  'or': {
    pt: 'ou',
  },
  'Edit page attachments': {
    pt: 'Alterar anexos da página',
  },
  'no tags selected': {
    pt: 'nenhuma tag selecionada',
  },
  'no more tags in use in this journal': {
    pt: 'não há mais tags em uso',
  },
  'no tags in use in this page': {
    pt: 'nenhuma tag me uso',
  },
  'submit': {
    pt: 'adicionar',
  },
  'Add': {
    pt: 'Adicionar',
  },
  'Or pick one of your tags': {
    pt: 'Ou use uma das suas tags',
  },
  'add a new tag': {
    pt: 'nova tag...',
  },
  'visit our project page': {
    pt: 'visite a página do projeto',
  },
  'Change language': {
    pt: 'Mudar idioma',
  },
};

export default language => {
  if (language === 'en') {
    return t => t;
  } else {
      return t => {
        try {
          return text[t][language];
        } catch (err) {
          console.warn(`Dictionary couldn´t find the term '${t}' for the '${language}' language`);
          return t;
        }
    }
  }
};
