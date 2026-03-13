export interface GeoLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
}

export interface Comment {
  id: string;
  text: string;
  date: string; // ISO 8601
}

export interface Attachment {
  id: string;
  path: string;
  name: string;
  type: 'image' | 'file';
  encrypted: boolean;
  size?: number; // bytes
  deleted: boolean;
}

export interface Page {
  id: string;
  text: string; // markdown
  date: string; // ISO 8601
  thumbnail?: string;
  location?: GeoLocation;
  tags: string[];
  files: Attachment[];
  images: Attachment[];
  comments: Comment[];
  modified: number; // unix timestamp ms
  deleted: boolean;
}

export interface PagePreview {
  id: string;
  date: string;
  previewText: string;
  tags: string[];
  hasImage: boolean;
  hasAttachment: boolean;
  hasLocation: boolean;
  hasComments: boolean;
  firstImage?: string;
}

export interface JournalSettings {
  use24h: boolean;
  previewTags: boolean;
  previewThumbnail: boolean;
  previewIcons: boolean;
  filterBar: boolean;
  sort: 'ascending' | 'descending' | 'none';
  showMarkdownPlaceholder: boolean;
  autoLocation: boolean;
  remoteSync: boolean;
  themeOverride?: string;
}

export interface Journal {
  id: string;
  title: string;
  icon: string;
  date: string; // ISO 8601 creation date
  secure: boolean;
  salt?: string; // base64-encoded salt, present when secure === true
  biometric?: boolean; // require biometric auth to open
  themeOverride?: string; // theme name override, synced from settings
}

export interface JournalContent extends Journal {
  pages: Page[];
  settings: JournalSettings;
  version: number;
}

export interface Filter {
  query: string;
  properties: {
    tags: string[];
    hasFile: boolean;
    hasImage: boolean;
    hasComments: boolean;
    hasLocation: boolean;
  };
  dateStart?: string;
  dateEnd?: string;
}

export const DEFAULT_JOURNAL_SETTINGS: JournalSettings = {
  use24h: false,
  previewTags: true,
  previewThumbnail: true,
  previewIcons: true,
  filterBar: true,
  sort: 'descending',
  showMarkdownPlaceholder: true,
  autoLocation: false,
  remoteSync: false,
};

export function pageToPreview(page: Page): PagePreview {
  const firstLine = page.text.split('\n').find((l) => l.trim().length > 0) ?? '';
  const previewText = firstLine.substring(0, 120);

  const firstNonEncryptedImage = page.images.find((img) => !img.encrypted && !img.deleted);

  return {
    id: page.id,
    date: page.date,
    previewText,
    tags: page.tags,
    hasImage: page.images.length > 0,
    hasAttachment: page.files.length > 0,
    hasLocation: !!page.location,
    hasComments: page.comments.length > 0,
    firstImage: firstNonEncryptedImage?.path,
  };
}
