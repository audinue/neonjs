# NeonJS

![NeonJS Logo](neon.jpg)

Yet another ODM for [NeDB](https://github.com/louischatriot/nedb) inspired by [Mongorito](http://mongorito.com/).

```
npm install neonjs
```

Tested on:
- The latest web browsers ([Chrome](https://www.google.com/chrome/) and [Firefox](https://www.mozilla.org/en-US/firefox/new/)).
- [Node](https://nodejs.org/en/) LTS v4.3.1

```javascript
let neonjs = require('neonjs')
let Model = neonjs.Model

// Define your models
class UserModel extends Model {
  
  sayHello () {
    return 'Hello ' + this.name
  }
}

// Assign your models to NeDB instances
let Nedb = require('nedb')
let User = UserModel.for(new Nedb({ filename: 'users.db', autoload: true }))

// Use your models
let run = neonjs.run // Batteries included

run(function * () {
  let user = new User({
    name: 'John Doe'
  })
  
  // No callbacks required :)
  yield user.save()
  
  let users = yield User.find().limit(7).exec()
})
```

## API

Expressed in [TypeScript](https://www.typescriptlang.org/).

```typescript
class Model {
  
  static for (db: Nedb): Function {}
  
  static find (query?: Object): ModelCursor {}

  static findOne (query?: Object): ModelCursor {}

  static count (query?: Object): ModelCursor {}

  static save(models: Array<Model>): Promise {}
  
  static remove(models: Array<Model>): Promise {}
}

class ModelCursor {
  
  sort (value): ModelCursor {}
  
  limit (value): ModelCursor {}
  
  skip (value): ModelCursor {}
  
  populate (property, model): ModelCursor {}
  
  exec(): Promise {}
}

function run (generator: Function): Promise {}

run.for = function (array: Array<any>, generator: Function): Promise {}
```

More information later. Stay tuned.
