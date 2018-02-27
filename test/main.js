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

  it('.filter(fn) filters correctly', async function () {
    const expect = [5, 6, 7, 8, 9];
    const actual = [];
    await holeWithArray([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
	.filter(n => {
	  return 5 <= n;
	})
	.pipe(n => {
	  actual.push(n);
	});
    assert.deepStrictEqual(actual, expect);
  });

  it('.filter(async fn) keeps order', async function () {
    const expect = [5, 6, 7, 8, 9];
    const actual = [];
    await holeWithArray([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
	.filter(async n => {
	  await timeout(Math.random() * 200);
	  return 5 <= n;
	})
	.pipe(n => {
	  actual.push(n);
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

  it('.pipe() and .filter() accept eitherstream option or highWaterMark number', async function () {
    const expect = 500;
    let actual = null;
    const r = createReadable(1000);
    await holeWithStream(r)
	.pipe(async i => {
	  await timeout(Math.random() * 10);
	  return i;
	}, 32)
	.filter(async i => {
	  await timeout(Math.random() * 10);
	  return 500 <= i;
	}, 32)
	.pipe(async () => {
	  actual = actual + 1;
	});
    assert.deepStrictEqual(actual, expect);
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
