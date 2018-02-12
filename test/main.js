// @flow

import assert from 'assert';
import stream from 'stream';
import fs from 'fs';
import hole, {holeWithArray, holeWithStream} from '../src/main';
import fetch from 'node-fetch';
import split2 from 'split2';

describe('Hole', function () {
  // this.timeout(30 * 1000);

  it('hole(obj) takes object', async function () {
    const expect = {ohh: 'yeah'};
    let actual = {};
    await hole({})
	.pipe(obj => {
	  obj.ohh = 'yeah';
	  return obj;
	})
	.pipe(obj => {
	  actual = obj;
	});
    assert.deepStrictEqual(actual, expect);
  });

  it('holeWithArray(array) takes array', async function () {
    const expect = ['a', 'b', 'c'];
    const actual = [];
    await holeWithArray(['a', 'b', 'c'])
	.pipe(letter => {
	  actual.push(letter);
	});
    assert.deepStrictEqual(actual, expect);
  });

  it('holeWithStream(readable) takes readable', async function () {
    const expect = [0, 1, 2, 3, 4];
    const actual = [];
    let i = 0;
    await holeWithStream(new stream.Readable({
      read() {
	this.push(i < 5 ? i : null);
	i++;
      },
      objectMode: true,
    }))
	.pipe((i) => {
	  actual.push(i);
	});
    assert.deepStrictEqual(actual, expect);
  });

  it('.pipe(fn) transforms data', async function () {
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

  it('.pipe(async fn) transforms data asyncronously', async function () {
    const expected = 5;
    let actual = 0;
    setTimeout(() => {
      assert.deepStrictEqual(actual, expected, 'It should buffer all in the middle');
    }, 100);
    await holeWithArray([1,2,3,4,5])
	.pipe(async n => {
	  actual++;
	  await timeout(300);
	  return n;
	})
	.pipe(() => {
	  actual--;
	});
    assert.deepStrictEqual(actual, 0, 'It should be decremented all afterward');
  });

  it('.pipe(async fn) simaltaniously consumes multiple data', async function () { });
  it('.pipe(async fn) keeps order', async function () {
    const expected = ['A', 'B', 'C', 'D', 'E'];
    const actualUnordered = [];
    const actualOrdered = [];
    await holeWithArray(['a', 'b', 'c', 'd', 'e'])
	.pipe(letter => letter.toUpperCase())
	.pipe(async (letter) => {
	  await timeout(Math.random() * 100);
	  actualUnordered.push(letter);
	  return letter;
	})
	.pipe(upper => {
	  return actualOrdered.push(upper);
	});
    assert.notDeepEqual(actualUnordered, expected);
    assert.deepStrictEqual(actualOrdered, expected);
  });
  it('.pipe(transform) accepts native transform', async function () { });
  it('.pipe(transform) accepts third party transform', async function () { });
  it('last .pipe(fn) does not store data in readable buffer even if it returns it', async function () { });
  it('.filter(fn) keeps order', async function () { });
  it('.filter(async fn) keeps order', async function () { });
  it('.piece() splits an passed array', async function () { });
  it('consumes large number of data', async function () { });

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

  it('.stop() postpones streaming and .start() launches it', async function () {
    const expected = 'yeah';
    let actual = '';
    const waiting = hole({value: 'yeah'})
	.pipe((obj) => {
	  actual = obj.value;
	})
	.stop();
    await timeout(100);
    assert.equal(actual, '');
    await waiting.start();
    assert.equal(actual, expected);
  });
});

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
