import {search} from 'ss-search';

export default class Filter {
  constructor(query, properties, dateStart, dateEnd) {
    this.query = query; //page.text
    this.properties = properties;
    this.dateStart = dateStart;
    this.dateEnd;
  }

  /**
   * Receives a list of page previews
   * Returns a filtered list of page previews
   * (Page previews defined at Models/Page/getPreview)
   */
  apply(pages) {
    const applyQuery = (items, query) => {
      if (!items || items.length === 0) {
        return [];
      }
      return search(items, ['text'], query);
    };

    const applyFilters = (items, properties) => {
      if (!items || items.length === 0) {
        return [];
      }
      let res = items;
      if (properties.location) {
        res = res.filter(p => p.location === properties.location);
      }
      if (properties.tags && properties.tags.length > 0) {
        res = res.filter(p => properties.tags.every(t => p.tags.includes(t)));
      }
      if (properties.attachments) {
        res = res.filter(p => p.numberOfAttachments > 0);
      }
      if (properties.comments) {
        res = res.filter(p => p.numberOfComments > 0);
      }
      if (properties.location) {
        res = res.filter(p => p.location);
      }
      return res;
    };

    const getDateOnly = date => {
      const d = new Date(date);
      return new Date(
        d.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      );
    };

    const applyDate = (items, start, end) => {
      if (!items || items.length === 0) {
        return [];
      }
      let s = getDateOnly(start);
      let e = getDateOnly(end);
      return items.filter(item => {
        const d = getDateOnly(item.date);
        return d >= s && d <= e;
      });
    };

    return applyQuery(applyFilters(applyDate(pages)));
  }
}
