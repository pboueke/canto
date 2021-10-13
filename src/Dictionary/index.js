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
    pt: '',
  },
  'since': {
    pt: 'desde',
  },
  'Use 24h format': {
    pt: 'Usar formato de tempo com 24h',
  },
  'Show tags on page previews': {
    pt: 'Mostrar tags das páginas',
  },
  'Show thumbnail on page previews': {
    pt: 'Mostar imagem das páginas',
  },
  'Show content indicators on page previews': {
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
    pt: 'Por favor escreva o texto abaixo para confirmar a deleção',
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
  'Show markdown tips on new pages': {
    pt: 'Mostrar dicas de markdown em novas páginas',
  },
  'Automatically add location data to new pages': {
    pt: 'Adicionar localização automaticamente',
  },
  'Toggles and Options': {
    pt: 'Opções',
  },
  'Danger Zone': {
    pt: 'Zona de Perigo',
  },
  'Change Journal Name': {
    pt: 'Mudar o Nome',
  },
  'Change Journal Password': {
    pt: 'Mudar a Senha',
  },
  'Delete Journal': {
    pt: 'Deletar',
  },
  'Confirm password': {
    pt: 'Confirme sua senha',
  },
  'Change': {
    pt: 'Mudar',
  },
  'Ok': {
    pt: 'OK',
  }, 
  'new value': {
    pt: 'novo valor',
  },
  'a Comment': {
    pt: 'um Comentário',
  },
  'Save': {
    pt: 'Salvar',
  },
  'Write your Comment': {
    pt: 'Escreva seu comentário',
  },
  'Are you sure to delete this comment?': {
    pt: "Tem certeza que quer deletar esse comentário?"
  },
  'click to edit': {
    pt: 'clique para editar',
  },
  'Change Icon': {
    pt: 'Mudar o Ícone',
  },
  'confirm new password': {
    pt: 'confirme a nova senha',
  },
  'Signed in as ': {
    pt: 'Logado como ',
  },
  'Sign Off': {
    pt: 'Sair',
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
