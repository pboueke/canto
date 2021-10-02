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
    files = [],
    images = [],
    comments = [],
  } = {}) {
    Object.assign(this, {
      text,
      date,
      id,
      thumbnail,
      tags,
      files,
      images,
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
      id: this.id,
      text: this.text,
      date: this.date,
      thumbnail: this.thumbnail,
      location: this.location,
      tags: this.tags,
      numberOfFiles: this.files.length,
      numberOfImages: this.images.length,
      numberOfComments: this.comments.length,
    };
  }
}
