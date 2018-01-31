const stream = require('stream');

let i = 0;
const highWaterMark = 10;

class MyReadable extends stream.Readable {
  constructor(options) {
    super({
      objectMode: true,
      highWaterMark,
      ...options,
    });
  }

  _read(_size) {
    console.log(`+read... ${i} (rb: ${this.readableLength})`);
    this.push({i: i++});
  }
}

class MyTransform extends stream.Transform {
  constructor(options) {
    super({
      objectMode: true,
      highWaterMark,
      ...options,
    });
  }

  _transform(chunk, enc, callback) {
    setTimeout(() => {
      const {i} = chunk;
      console.log(`++transform... ${i}, (rb: ${this.readableLength}, wb: ${this.writableLength})`);
      callback(null, chunk);
    }, 10);
  }
}

class MyWritable extends stream.Writable {
  constructor(options) {
    super({
      objectMode: true,
      highWaterMark,
      ...options,
    });
  }

  _write(chunk, encoding, callback) {
    setTimeout(() => {
      const {i} = chunk;
      console.log(`+++write... ${i}, (wb: ${this.writableLength})`);
      callback();
    }, 10);
  }
}

const r = new MyReadable();
const t = new MyTransform();
const w = new MyWritable();

r.pipe(t)
    .pipe(w);

// class Counter extends stream.Readable {
//   constructor(opt) {
//     super(opt);
//     this._max = 10000;
//     this._index = 1;
//   }
//
//   _read() {
//     const i = this._index++;
//     console.log(`count: ${i}`);
//     if (i > this._max)
//       this.push(null);
//     else {
//       const str = String(i);
//       const buf = Buffer.from(str, 'ascii');
//       this.push(buf);
//     }
//   }
// }
//


// FS.createReadStream('data.csv')
//     .pipe(csv2({highWaterMark: 3}))
//     .pipe(new stream.Transform({
//       readableObjectMode: true, // reading in buffers
//       writableObjectMode: true, // writing out json decoded objects
//       highWaterMark: 3, // bytes or objects???
//       transform(chunk, enc, callback) {
//         var data = {
//           name: chunk[0]
//           , address: chunk[3]
//           , phone: chunk[10]
//         };
//         console.log('(push)')
//         this.push(data);
//
//         // callback();
//         setTimeout(callback, 1200)
//       }
//     }))
//     // .pipe(through2({objectMode: true, highWaterMark: 3, readableHighWaterMark: 3, writableHighWaterMark:3},
// function (chunk, enc, callback) { //   var data = { //     name: chunk[0] //     , address: chunk[3] //     , phone:
// chunk[10] //   }; //   console.log('(push)') //   this.push(data); // //   setTimeout(callback, 2000) // }))
// .on('data', function (data) { console.log('--', data); }) .on('end', function () { console.log('Done!'); });

// var miss = require('mississippi');
//
// // lets do a simple file copy
// var fs = require('fs');
//
// var read = fs.createReadStream('./original.zip');
// var write = fs.createWriteStream('./copy.zip');
//
// // use miss.pipe instead of read.pipe(write)
// miss.pipe(read, write, function (err) {
//   if (err) return console.error('Copy error!', err);
//   console.log('Copied successfully');
// });
//
//
// stream(readable)
//     .pipe(slice())
//     .pipe(async (line) =>{
//
//     }, {parallel: 8});