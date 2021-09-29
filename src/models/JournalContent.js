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
    this.settings = new Settings(settings);
  }
}

class Settings {
  constructor({
    showThumbnails = true,
    showFirstLine = true,
    showMarkdownPlaceholder = true,
    autoLocation = false,
  }) {
    Object.assign(this, {
      showThumbnails,
      showFirstLine,
      showMarkdownPlaceholder,
      autoLocation,
    });
  }
}
