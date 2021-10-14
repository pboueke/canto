import {
  ListQueryBuilder,
  MimeTypes,
} from '@robinbobin/react-native-google-drive-api-wrapper';

const getJournalMetadata = async (journal, folderId, gdrive) => {
  const query = new ListQueryBuilder()
    .e('name', `${journal.content.id}.mtdt`)
    .and()
    .e('mimeType', MimeTypes.JSON_UTF8)
    .and()
    .in(folderId, 'parents');
  let files = await gdrive.files.list({
    q: query,
  });
  let data;
  if (files.files.length === 0) {
    data = journal.content;
    data.pages = data.pages.map(p => ({id: p.id, modified: p.modified}));
    gdrive.files
      .newMediaUploader()
      .setData(data, MimeTypes.JSON_UTF8)
      .setRequestBody({
        name: `${journal.content.id}.mtdt`,
        parents: [folderId],
      });
  } else {
    data = gdrive.files.getJson(files.files[0].id, {q: query});
  }
  return data;
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
