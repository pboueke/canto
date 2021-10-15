import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  GDrive,
  ListQueryBuilder,
  MimeTypes,
} from '@robinbobin/react-native-google-drive-api-wrapper';
import DriveCredentials from '../../gdriveCredentials';

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
      setUser(await GoogleSignin.signInSilently());
    }
    const gdrive = new GDrive();
    gdrive.accessToken = (await GoogleSignin.getTokens()).accessToken;

    return gdrive;
  } catch (error) {
    console.log(error);
  }
};

const getJournalMetadata = async (salt, journal, gdrive) => {
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
    let data = journal;
    data.salt = salt;
    data.content.pages = data.content.pages.map(p => ({
      id: p.id,
      modified: p.modified,
    }));
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

export {signInWithGDrive, getJournalMetadata};
