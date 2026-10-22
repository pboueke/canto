import { aesGcmEncrypt } from '@/lib/encryption/utils';
import {
  classifyPasswordLayer,
  countRecordLayer,
  emptyLayerCounts,
  isZeroKey,
  verifyKeyAgainstRecords,
} from '../key-integrity';

const KEY = new Uint8Array(32).fill(9);
const OTHER = new Uint8Array(32).fill(8);
const ZERO = new Uint8Array(32);

describe('key-integrity', () => {
  it('classifies each password layer', async () => {
    expect((await classifyPasswordLayer(await aesGcmEncrypt('{"a":1}', KEY), KEY)).layer).toBe(
      'real',
    );
    expect((await classifyPasswordLayer('{"a":1}', KEY)).layer).toBe('device-only');
    expect((await classifyPasswordLayer(await aesGcmEncrypt('x', ZERO), KEY)).layer).toBe(
      'legacy-zero',
    );
    expect((await classifyPasswordLayer(await aesGcmEncrypt('x', OTHER), KEY)).layer).toBe(
      'undecryptable',
    );
    // A zero key is never accepted as the supplied key.
    expect((await classifyPasswordLayer(await aesGcmEncrypt('x', ZERO), ZERO)).layer).toBe(
      'legacy-zero',
    );
    expect(isZeroKey(new Uint8Array(16))).toBe(false);
  });

  it('counts layers and invalid JSON without content', async () => {
    const counts = emptyLayerCounts();
    await countRecordLayer(counts, null, KEY);
    await countRecordLayer(counts, await aesGcmEncrypt('not json', KEY), KEY);
    await countRecordLayer(counts, await aesGcmEncrypt('x', OTHER), KEY);
    expect(counts).toMatchObject({
      total: 3,
      deviceFailed: 1,
      real: 1,
      undecryptable: 1,
      invalidJson: 1,
    });
  });

  it('verifies a key against metadata first, then other evidence', async () => {
    const meta = await aesGcmEncrypt(JSON.stringify({ id: 'j' }), KEY);
    expect(await verifyKeyAgainstRecords(meta, 'j', KEY, [])).toBe('valid');
    expect(await verifyKeyAgainstRecords(meta, 'j', ZERO, [])).toBe('invalid');
    expect(await verifyKeyAgainstRecords(await aesGcmEncrypt('nope', KEY), 'j', KEY, [])).toBe(
      'invalid',
    );
    const plainMeta = JSON.stringify({ id: 'j' });
    const realPage = await aesGcmEncrypt('{}', KEY);
    expect(
      await verifyKeyAgainstRecords(plainMeta, 'j', KEY, [async () => null, async () => realPage]),
    ).toBe('valid');
    // Only zero-key layers: no record can tell a right password from a wrong one.
    expect(
      await verifyKeyAgainstRecords(plainMeta, 'j', KEY, [
        async () => await aesGcmEncrypt('{}', ZERO),
      ]),
    ).toBe('unverifiable');
    expect(await verifyKeyAgainstRecords(await aesGcmEncrypt('{}', ZERO), 'j', KEY, [])).toBe(
      'unverifiable',
    );
    // A record the key cannot open, alongside zero-key ones, is a wrong password.
    expect(
      await verifyKeyAgainstRecords(plainMeta, 'j', KEY, [
        async () => await aesGcmEncrypt('{}', ZERO),
        async () => await aesGcmEncrypt('{}', OTHER),
      ]),
    ).toBe('invalid');
    // No password layer anywhere: any key opens it.
    expect(await verifyKeyAgainstRecords(plainMeta, 'j', KEY, [async () => '{}'])).toBe('valid');
  });
});
