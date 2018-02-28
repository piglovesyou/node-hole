// @flow

import assert from 'assert';
import stream from 'stream';
import fs from 'fs';
import hole, {holeWithArray, holeWithStream} from '../src/main';
import split2 from 'split2';

describe('Hole', function () {
  this.timeout(30 * 1000);

  it('hole(obj) takes object', async function () {
    const expect = {ohh: 'yeah'};
    let actual = null;
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
    const expect = [
      {upper: 'A'},
      {upper: 'B'},
      {upper: 'C'},
      {upper: 'D'},
      {upper: 'E'},
    ];
    const actual = [];
    await holeWithArray(['a', 'b', 'c', 'd', 'e'])
	.pipe(letter => letter.toUpperCase())
	.pipe(upper => actual.push({upper}));
    assert.deepStrictEqual(actual, expect);
  });

  it('.pipe(async fn) simaltaniously consumes multiple data', async function () {
    const expect = 5;
    let actual = 0;
    setTimeout(() => {
      assert.deepStrictEqual(actual, expect, 'It should buffer all in the middle');
    }, 100);
    await holeWithArray([1, 2, 3, 4, 5])
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

  it('.pipe(async fn) keeps order', async function () {
    const expect = ['A', 'B', 'C', 'D', 'E'];
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
    assert.notDeepEqual(actualUnordered, expect);
    assert.deepStrictEqual(actualOrdered, expect);
  });

  it('.pipe(transform) accepts native transform', async function () {
    const expect = ['A', 'B', 'C', 'D', 'E'];
    const actual = [];
    const t = new stream.Transform({
      transform: function (data, enc, callback) {
	callback(null, data.toUpperCase());
      },
      objectMode: true,
    });
    await holeWithArray(['a', 'b', 'c', 'd', 'e'])
	.pipe(t)
	.pipe(letter => {
	  actual.push(letter);
	});
    assert.deepStrictEqual(actual, expect);
  });

  it('.pipe(transform) accepts third party transform', async function () {
    const expect = '  "name": "hole",';
    const lines = [];
    await holeWithStream(fs.createReadStream('./package.json'))
	.pipe(split2())
	.pipe((line) => {
	  lines.push(line);
	});
    assert(lines.includes(expect));
  });

  it('.pipe(fn) filters out values by returning null or undefined', async function () {
    const expect = [4, 5, 6];
    const actual = [];
    await holeWithArray([1, 2, 3, 4, 5, 6, 7, 8])
	.pipe(function (n) {
	  if (4 <= n) {
	    return n;
	  }
	  return null;
	})
	.pipe(async function (n) {
	  if (n <= 6) {
	    return n;
	  }
	  return undefined;
	})
	.pipe(n => actual.push(n));
    assert.deepStrictEqual(actual, expect);
  });

  it('last .pipe(fn) does not store data in readable buffer even if it returns something', async function () {
    const expect = 999;
    let actual = null;
    const largeArray = [
      ...Array(expect)
	  .keys()
    ];
    await holeWithArray(largeArray)
	.pipe(index => {
	  return index;
	})
	.pipe(index => {
	  // If the last transfrom stores the "index" in the readable buffer, it's stuck in the middle.
	  actual = index + 1;
	  return index;
	});
    assert.deepStrictEqual(actual, expect);
  });

  it('.pieces() splits an passed array', async function () {
    const expect = ['a', 'b', 'c'];
    let actual = [];
    await hole({})
	.pipe(async obj => {
	  obj.items = ['a', 'b', 'c'];
	  return obj;
	})
	.pipe(obj => obj.items)
	.split()
	.pipe(item => {
	  actual.push(item);
	});
    assert.deepStrictEqual(actual, expect);
  });

  it('postpones streaming until .then() is called', async function () {
    const expect = 'yeah';
    let actual = '';
    const postponed = hole({value: 'yeah'})
	.pipe((obj) => {
	  actual = obj.value;
	});
    await timeout(100);
    assert.equal(actual, '');
    await postponed;
    assert.equal(actual, expect);
  });

  it('consumes large number of data', async function () {
    const expect = 10 * 1000;
    let actual = null;
    const r = createReadable(expect);
    await holeWithStream(r)
	.pipe(async i => {
	  await timeout(Math.random() * 10);
	  return i;
	}, {highWaterMark: 32})
	.pipe(i => {
	  actual = i + 1;
	});
    assert.deepStrictEqual(actual, expect);
  });

  it('.pipe() accepts either stream option or highWaterMark number', async function () {
    const expect = 500;
    let actual = null;
    const r = createReadable(1000);
    await holeWithStream(r)
	.pipe(async i => {
	  await timeout(Math.random() * 10);
	  return i;
	}, 32)
	.pipe(i => {
	  if (i < 500) return;
	  return i;
	}, 32)
	.pipe(async () => {
	  actual = actual + 1;
	});
    assert.deepStrictEqual(actual, expect);
  });

  it('.lineup(n) buffers multiple data and let the next process handle it as an array', async function () {
    const expect1 = [
      [0, 10, 20, 30, 40],
      [50, 60, 70, 80, 90],
      [100, 110, 120, 130, 140],
      [150, 160, 170, 180, 190],
      [200, 210, 220],
    ];
    const expect2 = [100, 200];
    const actual1 = [];
    const actual2 = [];
    await holeWithStream(createReadable(23))
	.pipe(n => n * 10)
	.lineup(5)
	.pipe(packed => {
	  actual1.push(packed);
	  return packed;
	})
	.pipe(packed => packed[0])
	.lineup(3)
	.pipe(packed => packed[packed.length - 1])
	.pipe(packed => actual2.push(packed));
    assert.deepStrictEqual(actual1, expect1);
    assert.deepStrictEqual(actual2, expect2);
  });
});

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createReadable(size) {
  let i = 0;
  return new stream.Readable({
    read: function () {
      this.push(i < size ? i++ : null);
    },
    objectMode: true,
  });
}
