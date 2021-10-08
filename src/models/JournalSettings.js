export default class JournalSettings {
  constructor({
    use24h = true,
    previewTags = true,
    previewThumbnail = true,
    previewIcons = true,
    filterBar = true,
    sort = 'ascending',
  } = {}) {
    Object.assign(this, {
      use24h,
      previewTags,
      previewThumbnail,
      previewIcons,
      filterBar,
      sort,
    });
  }

  static getKeys = () => Object.keys(options);

  static getOptions = setting => options[setting];
}

const options = {
  use24h: {label: 'Use 24h format', ui: 'switch', values: [true, false]},
  previewTags: {
    label: 'Show tags on page listing',
    ui: 'switch',
    values: [true, false],
  },
  previewThumbnail: {
    label: 'Show thumbnail on page listing',
    ui: 'switch',
    values: [true, false],
  },
  previewIcons: {
    label: 'Show content indicators on page listing',
    ui: 'switch',
    values: [true, false],
  },
  filterBar: {
    label: 'Enable the journal filter bar',
    ui: 'switch',
    values: [true, false],
  },
  sort: {
    label: 'Page list sort method by date',
    ui: 'picker',
    values: ['ascending', 'descending', 'none'],
  },
};
