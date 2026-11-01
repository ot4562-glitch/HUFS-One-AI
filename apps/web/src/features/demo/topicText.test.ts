import {describe, expect, it} from 'vitest';
import {TOPIC_CODES} from '@hufs-one/contracts';
import {TOPIC_LABELS_KO} from '../../../../../packages/core/src/normalization/topics.js';
import {TOPIC_TEXT} from './topicText.js';

describe('TopicCode display names', () => {
  it('cover all 24 codes and match the recommendation core exactly', () => {
    expect(Object.keys(TOPIC_TEXT).sort()).toEqual([...TOPIC_CODES].sort());
    expect(TOPIC_TEXT).toEqual(TOPIC_LABELS_KO);
  });
});
