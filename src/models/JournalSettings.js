export default class JournalSettings {
  constructor({
    use24h = false,
    previewTags = true,
    previewThumbnail = true,
    previewTime = true,
    previewIcons = true,
  } = {}) {
    Object.assign(this, {
      use24h,
      previewTags,
      previewThumbnail,
      previewTime,
      previewIcons,
    });
  }
}
