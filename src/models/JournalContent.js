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
}
