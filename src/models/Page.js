import {v5 as uuidv5} from 'uuid';
import {metadata} from '..';

export default class Page {
  constructor({
    text = '',
    date = new Date().toISOString(),
    id = uuidv5('page' + date, metadata.uuid),
    thumbnail = null,
    location = null,
    tags = [],
    attachments = [],
    comments = [],
  } = {}) {
    Object.assign(this, {
      text,
      date,
      id,
      thumbnail,
      tags,
      attachments,
      comments,
    });

    if (location) {
      this.location = location;
    }
  }

  setLocation() {
    /* use: react-native-geolocation-service */
  }

  getPreview() {
    return {
      text: this.text.split('\n')[0],
      date: this.date,
      thumbnail: this.thumbnail,
      location: this.location,
      tags: this.tags,
      numberOfAttachments: this.attachments.length,
      numberOfComments: this.comments.length,
    };
  }
}
