import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  offerDelivery,
  offerImageSchema,
  offerPhoneSchema,
  sellerContact,
} from '../src/lib/offer-media';
import { withOfferDetails } from '../src/lib/template-draft';

test('offer photos use captions within the provider limit and retain links for longer text', () => {
  const imageUrl = 'https://example.com/camera.jpg';
  assert.deepEqual(offerDelivery('Camera offer', imageUrl), {
    type: 'image',
    body: 'Camera offer',
    imageUrl,
  });
  assert.equal(offerDelivery('x'.repeat(1024), imageUrl).type, 'image');
  const long = offerDelivery('x'.repeat(1025), imageUrl);
  assert.equal(long.type, 'text');
  assert.ok(long.body.endsWith(imageUrl));
  assert.equal(long.imageUrl, null);
  for (const url of [
    'http://example.com/photo.jpg',
    'https://localhost/photo',
    'https://127.0.0.1/photo',
    'https://user:pass@example.com/photo',
    'javascript:alert(1)',
  ])
    assert.equal(offerImageSchema.safeParse(url).success, false);
  assert.equal(offerImageSchema.parse(imageUrl), imageUrl);
  assert.equal(offerPhoneSchema.parse('+964 (750) 000-0002'), '9647500000002');
  assert.equal(offerPhoneSchema.safeParse('07500000002').success, false);
  assert.match(sellerContact('9647500000002'), /https:\/\/wa.me\/9647500000002/);
  const details = { contactPhone: '9647500000002', imageUrl, locale: 'en' };
  const template = withOfferDetails('Camera offer. Reply STOP.', details);
  assert.equal(
    withOfferDetails(template, details),
    template,
    'template editing cannot duplicate contact links',
  );
  assert.ok(template.includes(imageUrl));
});
