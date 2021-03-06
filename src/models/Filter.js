import {search} from 'ss-search';

export default class Filter {
  constructor(query, properties, dateStart, dateEnd) {
    this.query = query; //page.text
    this.properties = properties;
    this.dateStart = dateStart;
    this.dateEnd = dateEnd;
  }

  /**
   * Receives a list of page previews
   * Returns a properties object to be used for filtering
   * (Page previews defined at Models/Page/getPreview)
   */
  static getAvailableProperties(pages) {
    let tags = new Set();
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].tags && pages[i].tags.length > 0) {
        pages[i].tags.forEach(t => tags.add(t));
      }
    }
    return {tags: Array.from(tags)};
  }

  static sortAscending(pages) {
    return pages.sort((p1, p2) => p1.date < p2.date);
  }

  static sortDescending(pages) {
    return pages.sort((p1, p2) => p1.date > p2.date);
  }

  static getOldestDate(pages, journalCreation) {
    let first = journalCreation;
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].date < first) {
        first = pages[i].date;
      }
    }
    return first;
  }

  static getDateOnly = date => {
    const d = new Date(date);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };

  /**
   * Receives a list of page previews
   * Returns a filtered list of page previews
   * (Page previews defined at Models/Page/getPreview)
   */
  apply(pages) {
    const applyQuery = (query, items) => {
      if (!items || items.length === 0) {
        return [];
      }
      if (!query || query === '') {
        return items;
      }
      let res = search(items, ['text'], query);
      return res;
    };

    const applyFilters = (properties, items) => {
      if (!items || items.length === 0) {
        return [];
      }
      let res = items;
      if (properties.tags && properties.tags.length > 0) {
        res = res.filter(p => properties.tags.every(t => p.tags.includes(t)));
      }
      if (properties.file) {
        res = res.filter(p => p.numberOfFiles > 0);
      }
      if (properties.image) {
        res = res.filter(p => p.numberOfImages > 0);
      }
      if (properties.comments) {
        res = res.filter(p => p.numberOfComments > 0);
      }
      if (properties.location) {
        res = res.filter(p => p.location);
      }
      return res;
    };

    const applyDate = (start, end, items) => {
      if (!items || items.length === 0) {
        return [];
      }
      let s = Filter.getDateOnly(start);
      let e = Filter.getDateOnly(end);
      let res = items.filter(item => {
        const d = Filter.getDateOnly(item.date);
        return d >= s && d <= e;
      });
      return res;
    };

    return applyQuery(
      this.query,
      applyFilters(
        this.properties,
        applyDate(this.dateStart, this.dateEnd, pages),
      ),
    );
  }
}
