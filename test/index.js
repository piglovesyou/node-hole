// @flow

import assert from 'assert';
import stream from 'stream';
import fs from 'fs';
import hole, {fromArray, fromStream} from '../src/index';
import split2 from 'split2';
import parallel from 'mocha.parallel'

parallel('Hole', function () {
  this.timeout(30 * 1000);

  it('hole(obj) takes object', async function () {
    const expect = {ohh: 'yeah'};
    let actual = null;
    await hole({ohh: null})
        .pipe(obj => {
          obj.ohh = 'yeah';
          return obj;
        })
        .pipe(obj => {
          actual = obj;
        });
    assert.deepStrictEqual(actual, expect);
  });

  it('fromArray(array) takes array', async function () {
    const expect = ['a', 'b', 'c'];
    const actual = [];
    await fromArray(['a', 'b', 'c'])
        .pipe(letter => {
          actual.push(letter);
        });
    assert.deepStrictEqual(actual, expect);
  });

  it('fromStream(readable) takes readable', async function () {
    const expect = [0, 1, 2, 3, 4];
    const actual = [];
    let i = 0;
    await fromStream(new stream.Readable({
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
    await fromArray(['a', 'b', 'c', 'd', 'e'])
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
    await fromArray([1, 2, 3, 4, 5])
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
    await fromArray(['a', 'b', 'c', 'd', 'e'])
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
    await fromArray(['a', 'b', 'c', 'd', 'e'])
        .pipe(t)
        .pipe(letter => {
          actual.push(letter);
        });
    assert.deepStrictEqual(actual, expect);
  });

  it('.pipe(transform) accepts third party transform', async function () {
    const expect = '  "name": "hole",';
    const lines = [];
    await fromStream(fs.createReadStream('./package.json'))
        .pipe(split2())
        .pipe((line) => {
          lines.push(line);
        });
    assert(lines.includes(expect));
  });

  it('.pipe(fn) filters out values by returning null or undefined', async function () {
    const expect = [4, 5, 6];
    const actual = [];
    await fromArray([1, 2, 3, 4, 5, 6, 7, 8])
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
    await fromArray(largeArray)
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

  it('.split() splits an passed array', async function () {
    const expect = ['a', 'b', 'c'];
    let actual = [];
    await hole({items: undefined})
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

  it('.split() can split a large array', async function() {
    const expect = 2 * 3000;
    let actual = 0;
    const data = [];
    for (let i = 0; i < 2; i++) {
      data.push(Array.from(Array(3000)).map((_,    i) => i));
    }
    await hole(data)
        .split()
        .pipe(async data => {
          await timeout(Math.random() * 5);
          return data;
        })
        .split()
        .pipe(async () => {
          await timeout(Math.random() * 5);
          actual++;
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
    let actual = 0;
    const r = createReadable(expect);
    await fromStream(r)
        .pipe(async () => {
          await timeout(Math.random() * 10);
          actual++;
        }, 32);
    assert.deepStrictEqual(actual, expect);
  });

  it('.pipe() accepts either stream option or maxParallel number', async function () {
    const expect = 500;
    let actual = null;
    const r = createReadable(1000);
    await fromStream(r)
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

  it('.concat(size) buffers multiple data and let the next process handle it as an array', async function () {
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
    await fromStream(createReadable(23))
        .pipe(n => n * 10)
        .concat(5)
        .pipe(packed => {
          actual1.push(packed);
          return packed;
        })
        .pipe(packed => packed[0])
        .concat(3)
        .pipe(packed => packed[packed.length - 1])
        .pipe(packed => actual2.push(packed));
    assert.deepStrictEqual(actual1, expect1);
    assert.deepStrictEqual(actual2, expect2);
  });

  it('.catch() stops stream in middle and catches error', async function () {
    const expect = 'boom 4';
    let actual = null;
    const done = [];
    const arr = [...new Array(10)].map((e, i) => i);
    await fromArray(arr)
        .pipe(async i => {
          await timeout(Math.random() * 100);
          if (i === 4) {
            throw new Error(`boom ${i}`);
          }
          return i;
        }, 2)
        .pipe(i => {
          done.push(i);
        })
        .catch(err => {
          actual = err.message;
        });
    assert.deepStrictEqual(actual, expect);
    assert(done.length < arr.length);
  });

  it('allows .push(data) inside a processor that runs a transformer context', async function () {
    const expect = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const actual = [];
    await hole({})
        .pipe(async function () {
          for (let i = 0; i < 10; i++) {
            await timeout(Math.random() * 100);
            this.push(i);
          }
        })
        .pipe(i => {
          actual.push(i);
        });
    assert.deepStrictEqual(actual, expect);
  });

  it('.collect() returns Promise<Array<any>> of value returned by last process', async function () {
    const expect = [40, 50, 60, 70, 80, 90, 100];
    const actual = await fromArray([...Array(10)].map((_, i) => i))
        .pipe(async n => {
          await timeout(Math.random() * 100);
          return n + 1;

        })
        .pipe(async n => {
          await timeout(Math.random() * 100);
          return n * 10;
        })
        .pipe(n => n >= 40 ? n : null)
        .collect();
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
