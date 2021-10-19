import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {
  GDrive,
  ListQueryBuilder,
  MimeTypes,
} from '@robinbobin/react-native-google-drive-api-wrapper';
import DriveCredentials from '../../gdriveCredentials';
import {JournalCover, JournalContent} from '../models';

const uploadPage = async (pageId, storage, gdrive) => {
  //console.log('UPLOADING FILE ' + pageId);
  const pageData = storage.getString(pageId);
  const query = new ListQueryBuilder()
    .e('name', pageId)
    .and()
    .e('mimeType', MimeTypes.TEXT);
  let pages = await gdrive.files.list({
    q: query,
    spaces: ['appDataFolder'],
  });
  let uploader = gdrive.files
    .newMultipartUploader()
    .setData(pageData, MimeTypes.TEXT);
  if (pages.files.length > 0) {
    uploader.setIdOfFileToUpdate(pages.files[0].id);
  } else {
    uploader.setRequestBody({
      name: pageId,
      parents: ['appDataFolder'],
    });
  }
  await uploader.execute();
};

const downloadPage = async (pageId, storage, gdrive) => {
  //console.log('DOWNLOADING FILE ' + pageId);
  const query = new ListQueryBuilder()
    .e('name', pageId)
    .and()
    .e('mimeType', MimeTypes.TEXT);
  let files = await gdrive.files.list({
    q: query,
    spaces: ['appDataFolder'],
  });
  const data = await gdrive.files.getText(files.files[0].id);
  storage.setString(pageId, data);
};

const deletePage = async (pageId, gdrive) => {
  //console.log('DELETING FILE ' + pageId);
  const query = new ListQueryBuilder()
    .e('name', pageId)
    .and()
    .e('mimeType', MimeTypes.TEXT);
  let files = await gdrive.files.list({
    q: query,
    spaces: ['appDataFolder'],
  });
  if (files.files[0]) {
    await gdrive.files.delete(files.files[0].id);
  } else {
    // Ignore in case this page was deleted before first synchronization.
    console.warn(`Tried to delete page:${pageId} from drive, but none found`);
  }
};

const signInWithGDrive = async setUser => {
  try {
    GoogleSignin.configure({
      webClientId: DriveCredentials.web.client_id,
      offlineAccess: true,
      //https://developers.google.com/identity/protocols/oauth2/scopes
      scopes: [
        'https://www.googleapis.com/auth/drive.appdata',
        'https://www.googleapis.com/auth/drive.file',
      ],
    });
    const isSignedIn = await GoogleSignin.isSignedIn();
    if (!isSignedIn) {
      const user = await GoogleSignin.signInSilently();
      setUser && setUser(user);
    }
    const gdrive = new GDrive();
    gdrive.accessToken = (await GoogleSignin.getTokens()).accessToken;

    return gdrive;
  } catch (error) {
    console.log(error);
  }
};

const getJournalMetadata = async (journal, enc, dec, salt, gdrive) => {
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
    let data = journal;
    data.content.pages = data.content.pages.map(p => ({
      id: p.id,
      modified: p.modified,
      deleted: p.deleted,
    }));
    const resp = await gdrive.files
      .newMultipartUploader()
      .setData(enc(data), MimeTypes.TEXT)
      .setRequestBody({
        name: name,
        parents: ['appDataFolder'],
      })
      .execute();
    id = resp.id;
    await journalLibrary({
      gdrive: gdrive,
      newJournal: {...new JournalCover(journal.content), salt},
    });
  } else {
    id = files.files[0].id;
  }
  return {id: id, data: dec(await gdrive.files.getText(id))};
};

const updateJournalMetadata = async (
  metadataId,
  metadata,
  journal,
  changes,
  enc,
  gdrive,
  callback,
) => {
  //console.log('UPDATING METADATA');
  const {pagesToDeleteRemotely: deletions} = changes;
  let data = metadata;
  data.salt = salt;
  data.settings = journal.settings;
  const previouslyDeleted = metadata.content.pages.filter(p => p.deleted);
  const newDeletions = deletions.map(pId => ({id: pId, deleted: true}));
  const notDeleted = journal.content.pages
    .filter(p => !p.deleted)
    .map(p => ({
      id: p.id,
      modified: p.modified,
      deleted: false,
    }));
  // Deletions are kept to avoid uploading pages from device A that were deleted
  // in device B. If B deletes a page, A will know and delete it, instead of
  // reuploading it as a new page.
  data.content.pages = [...notDeleted, ...previouslyDeleted, ...newDeletions];
  await gdrive.files
    .newMultipartUploader()
    .setData(enc(JSON.stringify(data)), MimeTypes.TEXT)
    .setIdOfFileToUpdate(metadataId)
    .execute();
};

const syncJournal = async (
  journal,
  storage,
  enc,
  dec,
  salt,
  onStart,
  onFinish,
  onError,
  setUser,
) => {
  let success = true;
  onStart();
  try {
    const gdrive = await signInWithGDrive(setUser);
    const {id: remoteJournalId, data: remoteJournal} = await getJournalMetadata(
      journal,
      enc,
      dec,
      salt,
      gdrive,
    );
    const localJournal = new JournalContent().overwrite(journal.content);
    const isSynced = localJournal.isUpToDate(remoteJournal);

    if (!isSynced) {
      const changes = localJournal.getPedingChanges(remoteJournal);
      changes.pagesToDeleteRemotely.forEach(
        async pId => await deletePage(pId, gdrive),
      );
      changes.pagesToUpload.forEach(
        async pId => await uploadPage(pId, storage, gdrive),
      );
      changes.pagesToDeleteLocally.forEach(pId => storage.removeItem(pId));
      changes.pagesToDownload.forEach(
        async pId => await downloadPage(pId, storage, gdrive),
      );
      await updateJournalMetadata(
        remoteJournalId,
        remoteJournal,
        journal,
        changes,
        enc,
        gdrive,
      );
    }
  } catch (error) {
    success = false;
    console.log(error);
    onError(error);
  }
  onFinish(success);
};

const removeJournal = async ({gdrive, jId, enc, dec}, onSuccess, onError) => {
  const _gdrive = gdrive ?? (await signInWithGDrive());
  const {lib: library, id: libId} = await journalLibrary({
    gdrive: _gdrive,
    getId: true,
  });
  const {id: metadataId, data: metadata} = await getJournalMetadata(
    {content: {id: jId}},
    enc,
    dec,
    null,
    _gdrive,
  );
  for (let i = 0; i < metadata.content.pages.length; i++) {
    try {
      const page = metadata.content.pages[i];
      await deletePage(page.id, _gdrive);
    } catch (error) {
      console.log(error);
    }
  }
  try {
    const newLibrary = library.filter(j => j.id !== jId);
    await _gdrive.files.delete(metadataId);
    await _gdrive.files
      .newMultipartUploader()
      .setData(JSON.stringify(newLibrary), MimeTypes.TEXT)
      .setIdOfFileToUpdate(libId)
      .execute();
    onSuccess && onSuccess();
  } catch (error) {
    console.log(error);
    onError && onError(error);
  }
};

const journalLibrary = async ({gdrive, newJournal, getId, setUser} = {}) => {
  let lib = [];
  const _gdrive = gdrive ?? (await signInWithGDrive(setUser));
  const query = new ListQueryBuilder()
    .e('name', 'canto-journals')
    .and()
    .e('mimeType', MimeTypes.TEXT);
  let files = await _gdrive.files.list({
    q: query,
    spaces: ['appDataFolder'],
  });
  if (files.files.length !== 0) {
    id = files.files[0].id;
    lib = JSON.parse(await _gdrive.files.getText(id));
  }
  if (newJournal) {
    lib.push(newJournal);
    let uploader = _gdrive.files
      .newMultipartUploader()
      .setData(JSON.stringify(lib), MimeTypes.TEXT);
    if (files.files.length > 0) {
      uploader.setIdOfFileToUpdate(files.files[0].id);
    } else {
      uploader.setRequestBody({
        name: 'canto-journals',
        parents: ['appDataFolder'],
      });
    }
    await uploader.execute();
  }
  if (getId) {
    return {lib, id};
  } else {
    return lib;
  }
};

export default {syncJournal, journalLibrary, removeJournal};
