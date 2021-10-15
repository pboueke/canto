import {metadata} from '..';
import {JournalCover} from '.';

export default class JournalContent {
  constructor({
    cover = new JournalCover(),
    settings = {},
    pages = [],
    srcVersion = metadata.srcVersion,
  } = {}) {
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

  overwrite(data) {
    Object.assign(this, data);
    return this;
  }

  isUpToDate(remoteJournal) {
    const remoteData = {};
    remoteJournal.content.pages.forEach(p => (remoteData[p.id] = p.modified));
    return this.pages.every(p => p.modified === remoteData[p.id]);
  }

  getPedingChanges(remoteJournal) {
    const remoteData = {};
    const remoteIds = [];
    const localIds = this.pages.map(lp => lp.id);
    remoteJournal.content.pages.forEach(p => {
      remoteIds.push(p.id);
      remoteData[p.id] = p;
    });
    let res = {
      pagesToUpload: [],
      pagesToDownload: [],
      pagesToDeleteLocally: [],
      pagesToDeleteRemotely: [],
    };
    res.pagesToDeleteRemotely = remoteIds.filter(id => !localIds.includes(id));
    for (let i = 0; i < this.pages.length; i++) {
      const id = this.pages[i].id;
      const localPage = this.pages[i];
      const remotePage = remoteData[id];
      if (!remotePage) {
        res.pagesToUpload.push(id);
      } else if (remotePage.deleted) {
        res.pagesToDeleteLocally.push(id);
      } else if (remotePage.modified > localPage.modified) {
        res.pagesToDownload.push(id);
      } else if (remotePage.modified < localPage.modified) {
        res.pagesToUpload.push(id);
      }
    }
    return res;
  }
}
