# Hole [![Build Status](https://travis-ci.org/piglovesyou/node-hole.svg?branch=master)](https://travis-ci.org/piglovesyou/node-hole)
Async friendly stream utility of Node.js

# Usage
Install `hole` in your project

```
$ npm add hole
```

Then use it as you want.

```
import {from as streamFrom} from 'hole';
import fetch from 'node-fetch';

main();

async function main() {
	const url = 'https://jsonplaceholder.typicode.com/posts';
	await streamFrom({url})
		.pipe(async function ({url}) {
		  return await fetch(url)
			  .then(res => res.text())
			  .then(JSON.parse);
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
		.pipe((post) => {
		  assert(typeof post.id === 'number');
		  assert(typeof post.title === 'string');
		  assert(Array.isArray(post.comments));
		})
		.start();
	console.log('done.');
}
```

# Concept
// TODO

# License

MIT