import assert from 'node:assert/strict';
import { test } from 'node:test';
import { movePhoto, principalPhotoFirst } from './photo-order.ts';
test('dragging a photo to the first slot sets the cover and preserves the other relative positions', () => {
  assert.deepEqual(movePhoto(['a','b','c','d'],3,0),['d','a','b','c']);
  assert.deepEqual(movePhoto(['d','a','b','c'],1,3),['d','b','c','a']);
  assert.deepEqual(movePhoto(['a','b','c','d'],0,2),['b','c','a','d']);
});
test('bounds and no-op movement preserve the same array, and legacy covers appear first', () => {
  const photos=['a','b','c'];
  for(const [from,to] of [[0,-1],[2,3],[1,1],[-1,0]]) assert.equal(movePhoto(photos,from,to),photos);
  assert.deepEqual(principalPhotoFirst(['a','b','b','','c'],'c'),['c','a','b']);
});
