import assert from 'assert';
import {from as streamFrom} from '../src/main';
import fetch from 'node-fetch';

describe('Hole', function () {
  it('simply runs without errors', async function () {
    this.timeout(10 * 1000);

    return await main();

    async function main() {
      const url = 'https://jsonplaceholder.typicode.com/posts';
      console.time('speed?');
      let expectPostCount = 0;
      let actualPostCount = 0;
      
      await streamFrom(url)
	  .pipe(async function (url) {
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
	    assert(typeof out.id === 'number')
	    assert(typeof out.title === 'string')
	    assert(Array.isArray(out.comments))
	    actualPostCount = actualPostCount + 1;
	  })
	  .exec();
      assert.equal(actualPostCount, expectPostCount);
      console.timeEnd('speed?');
      console.log('done.');
    }

  });
});