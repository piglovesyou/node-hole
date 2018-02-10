// @flow

import assert from 'assert';
import fs from 'fs';
import hole, {holeWithArray, holeWithStream} from '../src/main';
import fetch from 'node-fetch';
import split2 from 'split2';

describe('Hole', function () {
  this.timeout(30 * 1000);

  it('accepts object', async function () {
    const url = 'https://jsonplaceholder.typicode.com/posts';
    let expectPostCount = -1;
    let actualPostCount = 0;

    await hole({url})
	.pipe(async function ({url}) {
	  const posts = await fetch(url)
	      .then(res => res.text())
	      .then(JSON.parse);
	  expectPostCount = posts.length;
	  return posts;
	})
	.pieces()
	.pipe(async function (post) {
	  const url = `https://jsonplaceholder.typicode.com/posts/${post.id}/comments`;
	  const comments = await fetch(url)
	      .then(res => res.text())
	      .then(JSON.parse);
	  return {
	    id: post.id,
	    title: post.title,
	    comments: comments.map(c => c.body),
	  };
	})
	.pipe((out) => {
	  assert(typeof out.id === 'number');
	  assert(typeof out.title === 'string');
	  assert(Array.isArray(out.comments));
	  actualPostCount = actualPostCount + 1;
	});
    assert.equal(actualPostCount, expectPostCount);
  });

  it('holeWithArray accepts array', async function () {
    const expected = [
      {upper: 'A'},
      {upper: 'B'},
      {upper: 'C'},
      {upper: 'D'},
      {upper: 'E'},
    ];
    const actual = [];
    await holeWithArray(['a', 'b', 'c', 'd', 'e'])
	.pipe(letter => letter.toUpperCase())
	.pipe(async (letter) => {
	  await timeout(Math.random() * 100);
	  return letter;
	})
	.pipe(upper => actual.push({upper}));
    assert.deepStrictEqual(actual, expected);
  });

  it('holeWithStream accepts readable stream', async function () {
    const expected = 'hole';
    let actual = '';
    await holeWithStream(fs.createReadStream('./package.json'))
	.pipe(split2())
	.pipe(line => {
	  const matched = line.match(/^ {2}"name": "(\w+?)",$/);
	  if (matched && matched[1]) {
	    actual = matched[1];
	  }
	});
    assert.equal(actual, expected);
  });

  it('.filter() filters correctly', async function () {
    const expected = [5, 6, 7];
    const actual = [];
    await holeWithArray([1, 2, 3, 4, 5, 6, 7, 8])
	.filter((n) => {
	  return 5 <= n;
	})
	.filter(async (n) => {
	  await timeout(Math.random() * 100);
	  return n <= 7;
	})
	.pipe((n) => {
	  return actual.push(n);
	});
    assert.deepStrictEqual(expected, actual);
  });
});

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
