import {
  ListQueryBuilder,
  MimeTypes,
} from '@robinbobin/react-native-google-drive-api-wrapper';

const getJournalMetadata = async (journal, gdrive) => {
  //https://stackoverflow.com/questions/38213298/using-google-drive-appdatafolder-to-store-app-state-with-javascript-on-the-clien
  const name = `${journal.content.id}.mtdt`;
  const query = new ListQueryBuilder()
    .e('name', name)
    .and()
    .e('mimeType', MimeTypes.TEXT);
  let files = await gdrive.files.list({
    q: query,
    spaces: ['appDataFolder'],
  });
  let id;
  if (files.files.length === 0) {
    console.log(`WRITING ${name} to store: `);
    let data = journal.content;
    data.pages = data.pages.map(p => ({id: p.id, modified: p.modified}));
    const resp = await gdrive.files
      .newMultipartUploader()
      .setData(JSON.stringify(data), MimeTypes.TEXT)
      .setRequestBody({
        name: name,
        parents: ['appDataFolder'],
      })
      .execute();
    id = resp.id;
  } else {
    id = files.files[0].id;
  }
  return JSON.parse(await gdrive.files.getText(id));
};

const getFolderId = async (journalId, gdrive) => {
  let folders = await gdrive.files.list({
    q: new ListQueryBuilder()
      .e('name', journalId)
      .and()
      .e('mimeType', MimeTypes.FOLDER)
      .and()
      .in('appDataFolder', 'parents'),
  });
  if (folders.files.length < 1) {
    return (
      await gdrive.files
        .newMetadataOnlyUploader()
        .setRequestBody({
          name: journalId,
          parents: ['appDataFolder'],
          mimeType: MimeTypes.FOLDER,
        })
        .execute()
    ).id;
  } else {
    return folders.files[0].id;
  }
};

export {getFolderId, getJournalMetadata};
