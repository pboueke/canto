import { validateArchiveInventory } from '../backup/native-archive';

describe('native archive inventory validation', () => {
  it('accepts normal files and directory entries', () => {
    expect(() =>
      validateArchiveInventory([
        {
          name: 'manifest.json',
          size: 10,
          compressedSize: 10,
          method: 0,
          crc: 1,
          directory: false,
        },
        { name: 'journal.json', size: 10, compressedSize: 10, method: 0, crc: 1, directory: false },
        { name: 'pages/', size: 0, compressedSize: 0, method: 0, crc: 0, directory: true },
        {
          name: 'pages/page-1.json',
          size: 12,
          compressedSize: 10,
          method: 8,
          crc: 1,
          directory: false,
        },
        {
          name: 'attachments/image-a.jpg',
          size: 1024,
          compressedSize: 700,
          method: 8,
          crc: 1,
          directory: false,
        },
      ]),
    ).not.toThrow();
  });

  it.each(['../journal.json', '/journal.json', 'pages/../journal.json', 'pages\\page.json'])(
    'rejects unsafe ZIP path %s',
    (name) => {
      expect(() =>
        validateArchiveInventory([
          {
            name: 'manifest.json',
            size: 1,
            compressedSize: 1,
            method: 0,
            crc: 0,
            directory: false,
          },
          { name: 'journal.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
          { name, size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
        ]),
      ).toThrow('Invalid archive entry');
    },
  );

  it('rejects duplicate and unknown-sized central-directory entries', () => {
    expect(() =>
      validateArchiveInventory([
        { name: 'manifest.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
        { name: 'journal.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
        { name: 'journal.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
      ]),
    ).toThrow('Invalid archive entry');
    expect(() =>
      validateArchiveInventory([
        { name: 'manifest.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
        { name: 'journal.json', size: -1, compressedSize: 1, method: 0, crc: 0, directory: false },
      ]),
    ).toThrow('Invalid archive entry');
  });

  it('rejects invalid integrity metadata and archive-bomb ratios', () => {
    const required = [
      { name: 'manifest.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
      { name: 'journal.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
    ];
    expect(() =>
      validateArchiveInventory([
        ...required,
        {
          name: 'attachments/bomb',
          size: 100_000,
          compressedSize: 1,
          method: 8,
          crc: 0,
          directory: false,
        },
      ]),
    ).toThrow('compression ratio');
    expect(() =>
      validateArchiveInventory([
        ...required,
        { name: 'pages/p.json', size: 1, compressedSize: 1, method: 99, crc: 0, directory: false },
      ]),
    ).toThrow('Invalid archive entry');
  });

  it('rejects archive totals and a missing required journal entry', () => {
    expect(() =>
      validateArchiveInventory([
        {
          name: 'manifest.json',
          size: 2 * 1024 * 1024 * 1024,
          compressedSize: 2 * 1024 * 1024 * 1024,
          method: 0,
          crc: 0,
          directory: false,
        },
        {
          name: 'journal.json',
          size: 1,
          compressedSize: 1,
          method: 0,
          crc: 0,
          directory: false,
        },
      ]),
    ).toThrow('uncompressed size exceeds limit');
    expect(() =>
      validateArchiveInventory([
        { name: 'manifest.json', size: 1, compressedSize: 1, method: 0, crc: 0, directory: false },
      ]),
    ).toThrow('missing journal.json');
  });
});
