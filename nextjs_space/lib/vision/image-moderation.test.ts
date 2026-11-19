import assert from 'node:assert/strict';
import { applyMultiSignalUnderageRule } from './image-moderation-rules';

/** Pure multi-signal gate — no network. Run: npx tsx lib/vision/image-moderation.test.ts */

function run() {
  // Flat chest / petite alone (body childlike only) must NOT flag.
  const petiteOnly = applyMultiSignalUnderageRule({
    facialMaturity: 'adult',
    bodyMaturity: 'childlike',
    overallPresentation: 'adult',
    isUnderageOrChildlike: true, // model wrongly flagged
  });
  assert.equal(petiteOnly.isUnderageOrChildlike, false);
  assert.equal(petiteOnly.underageSignalCount, 1);

  // Adult face + adult overall hard-vetoes even if model set true.
  const adultFace = applyMultiSignalUnderageRule({
    facialMaturity: 'adult',
    bodyMaturity: 'ambiguous',
    overallPresentation: 'adult',
    isUnderageOrChildlike: true,
  });
  assert.equal(adultFace.isUnderageOrChildlike, false);

  // Two childlike axes converge → flag.
  const multi = applyMultiSignalUnderageRule({
    facialMaturity: 'childlike',
    bodyMaturity: 'childlike',
    overallPresentation: 'ambiguous',
  });
  assert.equal(multi.isUnderageOrChildlike, true);
  assert.equal(multi.underageSignalCount, 2);

  // Three axes → flag.
  const clear = applyMultiSignalUnderageRule({
    facialMaturity: 'childlike',
    bodyMaturity: 'childlike',
    overallPresentation: 'childlike',
  });
  assert.equal(clear.isUnderageOrChildlike, true);
  assert.equal(clear.underageSignalCount, 3);

  console.log('image-moderation multi-signal tests passed');
}

run();
