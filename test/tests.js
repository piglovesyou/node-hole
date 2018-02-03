import assert from 'assert';
import fs from 'fs';
import {default as stream, from as streamFrom, fromArray as streamFromArray} from '../src/main';
import fetch from 'node-fetch';
import split2 from 'split2';

describe('Hole', function () {
  this.timeout(10 * 1000);

  it('accepts readable stream', async function () {
    const expected = 'hole';
    let actual = '';
    await stream(fs.createReadStream('./package.json'))
	.pipe(split2())
	.pipe(line => {
	  const matched = line.match(/^  "name": "(\w+?)",$/);
	  if (matched && matched[1]) {
	    actual = matched[1];
	  }
	})
	.start();
    assert.equal(actual, expected);
  });

  it('"from" accepts object', async function () {
    const url = 'https://jsonplaceholder.typicode.com/posts';
    let expectPostCount = -1;
    let actualPostCount = 0;

    await streamFrom({url})
	.pipe(async function ({url}) {
	  const posts = await fetch(url)
	      .then(res => res.text())
	      .then(JSON.parse);
	  expectPostCount = posts.length;
	  return posts;
	})
	.split()
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
	})
	.start();
    assert.equal(actualPostCount, expectPostCount);
  });

  it('"fromArray" accepts array', async function () {
    const expected = [
      {upper: 'A'},
      {upper: 'B'},
      {upper: 'C'},
      {upper: 'D'},
      {upper: 'E'},
    ];
    const actual = [];
    await streamFromArray(['a', 'b', 'c', 'd', 'e'])
	.pipe(letter => letter.toUpperCase())
	.pipe(upper => actual.push({upper}))
	.start();
    assert.deepStrictEqual(actual, expected);
  });
});