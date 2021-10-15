import {metadata} from '..';

export default class JournalContent {
  constructor({
    cover,
    settings = {},
    pages = [],
    srcVersion = metadata.srcVersion,
  }) {
    const {title, icon, date, id, secure, hash} = {...cover};
    Object.assign(this, {
      title,
      icon,
      date,
      id,
      secure,
      hash,
      pages,
      srcVersion,
    });
  }

  isUpToDate(remoteJournal) {
    const remoteData = {};
    remoteJournal.pages.forEach(p => (remoteData[p.id] = p.modified));
    return this.pages.every(p => p.modified === remoteData[p.id]);
  }
}
