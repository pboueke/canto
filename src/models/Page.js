import Geolocation from 'react-native-geolocation-service';
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

  static setLocation(setter) {
    Geolocation.getCurrentPosition(
      position => {
        setter(position);
      },
      error => {
        console.log(error.code, error.message);
      },
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
    );
  }

  getPreview() {
    return {
      id: this.id,
      text:
        this.text /* comments added for querying*/ +
        [...this.comments, {text: ''}]
          .map(c => `\n${c.text}`)
          .reduce((t1, t2) => t1 + t2),
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

export class Comment {
  constructor(text = '', date = new Date()) {
    this.text = text;
    this.date = date;
  }
}
