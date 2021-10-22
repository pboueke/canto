import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {
  GDrive,
  ListQueryBuilder,
  MimeTypes,
} from '@robinbobin/react-native-google-drive-api-wrapper';
import {getFileAsBinary, saveBinaryFile} from '.';
import DriveCredentials from '../../gdriveCredentials';
import {JournalCover, JournalContent} from '../models';

const uploadPage = async (pageId, storage, gdrive) => {
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

const updateJournalPageData = async (
  metadataId,
  metadata,
  journal,
  changes,
  salt,
  enc,
  gdrive,
  callback,
) => {
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
    .setData(enc(data), MimeTypes.TEXT)
    .setIdOfFileToUpdate(metadataId)
    .execute();
  callback && callback();
};

const updateJournalMetadata = async (
  jId,
  changes,
  enc,
  dec,
  callback,
  gdrive,
) => {
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
  let newLibrary = library;
  for (let i = 0; i < library.length; i++) {
    if (library[i].id === jId) {
      newLibrary[i] = {...library[i], ...changes};
      break;
    }
  }
  try {
    await _gdrive.files
      .newMultipartUploader()
      .setData(enc({...metadata, ...changes}), MimeTypes.TEXT)
      .setIdOfFileToUpdate(metadataId)
      .execute();
    await _gdrive.files
      .newMultipartUploader()
      .setData(JSON.stringify(newLibrary), MimeTypes.TEXT)
      .setIdOfFileToUpdate(libId)
      .execute();
    callback && callback();
  } catch (error) {
    console.log(error);
  }
};

const syncJournal = async (
  journal,
  storage,
  enc,
  dec,
  salt,
  album,
  updateAlbum,
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
      await updateJournalPageData(
        remoteJournalId,
        remoteJournal,
        journal,
        changes,
        salt,
        enc,
        gdrive,
      );
    }
    await syncAlbum(
      journal.content.id,
      enc,
      dec,
      album,
      updateAlbum,
      gdrive,
      true,
    );
  } catch (error) {
    success = false;
    console.log(error);
    onError(error);
  }
  onFinish(success);
};

const uploadFile = async (id, path, gdrive) => {
    //TODO: create image directory for canto at user's root
    try {
    const bin = await getFileAsBinary(path);
    console.log(path);
    await gdrive.files
      .newMultipartUploader()
      .setData(bin, MimeTypes.BINARY)
      .setRequestBody({name: id, parents: ['root']}) //spaces: ['appDataFolder']})
      .execute();
    console.log(`uploaded ${id}`);
  } catch (error) {
    console.warn(`Failed to upload file ${id}`);
    console.log(error);
  }
};

const downloadFile = async (file, gdrive) => {
  const query = new ListQueryBuilder()
    .e('name', file.id)
    .and()
    .e('mimeType', MimeTypes.BINARY);
  let files = await gdrive.files.list({
    q: query,
    spaces: ['appDataFolder'],
  });
  const data = await gdrive.files.getBinary(files.files[0].id);
  const name = file.name ?? new Date().toLocaleString();
  const ext = file.path.split('').pop();
  return await saveBinaryFile(file.id, data, name, ext);
};

const deleteFile = async (id, gdrive) => {
  const query = new ListQueryBuilder()
    .e('name', id)
    .and()
    .e('mimeType', MimeTypes.BINARY);
  let files = await gdrive.files.list({
    q: query,
    spaces: ['appDataFolder'],
  });
  if (files.files[0]) {
    await gdrive.files.delete(files.files[0].id);
  } else {
    console.warn(`Tried to delete page:${pageId} from drive, but none found`);
  }
};

const getAlbum = async (jId, enc, dec, gdrive) => {
  const name = `${jId}.album`;
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
    let data = [];
    const resp = await gdrive.files
      .newMultipartUploader()
      .setData(enc(data), MimeTypes.TEXT)
      .setRequestBody({
        name: name,
        parents: ['appDataFolder'],
      })
      .execute();
    id = resp.id;
  } else {
    id = files.files[0].id;
  }
  return {id: id, data: dec(await gdrive.files.getText(id))};
};

const syncAlbum = async (
  jId,
  enc,
  dec,
  album,
  updateAlbum,
  gdrive,
  force = false,
) => {
  const {id: remoteAlbumId, data: _remoteAlbum} = await getAlbum(
    jId,
    enc,
    dec,
    gdrive,
  );
  const remoteAlbum = force ? [] : _remoteAlbum;
  let localAlbumChanges = {toAdd: [], toRemove: []};
  let updatedRemoteAlbum = remoteAlbum;
  const remoteDic = [{}, ...remoteAlbum].reduce((o, f) => (o[f.id] = f) && o);
  const localDic = [{}, ...album].reduce((o, f) => (o[f.id] = f) && o);
  const changes = {
    deleteLocally: new Set(),
    deleteRemotelly: new Set(),
    upload: new Set(),
    download: new Set(),
  };
  album.forEach(lF => {
    if (lF.deleted && remoteDic[lF.id] && !remoteDic[lF.id].deleted) {
      changes.deleteRemotelly.add(lF);
    } else if (!lF.deleted && remoteDic[lF.id] && remoteDic[lF.id].deleted) {
      changes.deleteLocally.add(lF);
    } else if (!lF.deleted && !remoteDic[lF.id]) {
      changes.upload.add(lF);
    }
  });
  remoteAlbum.forEach(rF => {
    if (rF.deleted && localDic[rF.id] && !localDic[rF.id].deleted) {
      changes.deleteLocally.add(rF);
    } else if (!rF.deleted && localDic[rF.id] && localDic[rF.id].deleted) {
      changes.deleteRemotelly.add(rF);
    } else if (!rF.deleted && !localDic[rF.id]) {
      changes.download.add(rF);
    }
  });
  Object.keys(changes).forEach(c => (changes[c] = Array.from(changes[c])));
  console.log(changes);
  for (let i = 0; i < changes.deleteRemotelly.length; i++) {
    await deleteFile(changes.deleteRemotelly[i].id, gdrive);
    updatedRemoteAlbum = updatedRemoteAlbum.filter(
      f => f.id !== changes.deleteRemotelly[i].id,
    );
  }
  for (let i = 0; i < changes.upload.length; i++) {
    const {id, path} = changes.upload[i];
    await uploadFile(id, path, gdrive);
    updatedRemoteAlbum.push(changes.upload[i]);
  }
  for (let i = 0; i < changes.download.length; i++) {
    const {id, name} = changes.download[i];
    const path = await downloadFile(changes.deleteRemotelly[i], gdrive);
    localAlbumChanges.toAdd.push({id, path, name});
  }
  for (let i = 0; i < changes.deleteLocally.length; i++) {
    localAlbumChanges.toRemove.push({id: changes.deleteLocally[i].id});
  }
  updateAlbum(localAlbumChanges);
  await gdrive.files
    .newMultipartUploader()
    .setData(enc(updatedRemoteAlbum), MimeTypes.TEXT)
    .setIdOfFileToUpdate(remoteAlbumId)
    .execute();
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

export default {
  syncJournal,
  journalLibrary,
  removeJournal,
  updateJournalMetadata,
};
