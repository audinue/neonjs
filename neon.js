'use strict'

;(function () {

  function run (generator) {
    let args = Array.from(arguments).slice(1)
    return new Promise((resolve, reject) => {
      let iterator = generator.apply(null, args)
      let resume = (method, value) => {
        try {
          let result = iterator[method](value)
          if (!result.done) {
            if (Array.isArray(result.value)) {
              let required = result.value.length
              if (!required) {
                resumeNext([])
              } else {
                let products = new Array(result.value.length)
                for (let i = 0, length = result.value.length; i < length; i++) {
                  result.value[i]
                    .then((value) => {
                      products[i] = value
                      if (!--required) {
                        resumeNext(products)
                      }
                    })
                    .catch(resumeThrow)
                }
              }
            } else {
              result.value.then(resumeNext, resumeThrow)
            }
          } else {
            resolve(result.value)
          }
        } catch (e) {
          reject(e)
        }
      }
      let resumeNext = resume.bind(null, 'next')
      let resumeThrow = resume.bind(null, 'throw')
      resumeNext()
    })
  }

  run.for = function (array, generator) {
    return array.map((value) => {
      return run(generator, value)
    })
  }

  function isObject (object) {
    return typeof object === 'object' && object !== null
  }

  class ModelCursor {

    constructor (method, model, query) {
      this._method = method
      this._model = model
      this._query = query || {}
      this._populate = {}
    }

    sort (value) {
      this._sort = value
      return this
    }

    limit (value) {
      this._limit = value
      return this
    }

    skip (value) {
      this._skip = value
      return this
    }

    populate (property, model) {
      this._populate[property] = model
      return this
    }

    _populateModel (model) {
      return run(function * () {
        for (let i in this._populate) {
          if (typeof model[i] === 'string') {
            model[i] = yield this._populate[i].findOne({ _id: model[i]}).exec()
          } else if (Array.isArray(model[i])) {
            model[i] = yield run.for(model[i], function * (id) {
              if (typeof id === 'string') {
                return yield this._populate[i].findOne({ _id: id}).exec()
              }
              return id
            }.bind(this))
          }
        }
        return model
      }.bind(this))
    }

    _exec () {
      return new Promise((resolve, reject) => {
        this._model._db[this._method](this._query)
          .sort(this._sort)
          .limit(this._limit)
          .skip(this._skip)
          .exec((error, documents) => {
            if (error) {
              reject(error)
              return
            }
            if (Array.isArray(documents)) {
              resolve(documents.map((document) => {
                if (this._model._objects.hasOwnProperty(document._id)) {
                  return this._model._objects[document._id]
                }
                return this._model._objects[document._id] = new this._model(document)
              }))
            } else if (isObject(documents)) {
              if (this._model._objects.hasOwnProperty(documents._id)) {
                resolve(this._model._objects[documents._id])
              } else {
                resolve(this._model._objects[documents._id] = new this._model(documents))
              }
            } else {
              resolve(documents)
            }
          })
      })
    }
    
    _setInserted (model) {
      Object.defineProperties(model, {
        modelIsInserted: {
          value: true,
          configurable: true
        }
      })
      return model
    }

    exec () {
      return run(function * () {
        let result = yield this._exec()
        if (Array.isArray(result)) {
          yield run.for(result, function * (model) {
            yield this._populateModel(this._setInserted(model))
          }.bind(this))
        } else if (isObject(result)) {
          yield this._populateModel(this._setInserted(result))
        }
        return result
      }.bind(this))
    }
  }


  function insert(db, doc) {
    return new Promise(function (resolve, reject) {
      db.insert(doc, function (error, newDoc) {
        if (error) {
          reject(error)
          return
        }
        resolve(newDoc)
      })
    })
  }

  function update(db, doc) {
    return new Promise(function (resolve, reject) {
      db.update({ _id: doc._id }, doc, function (error, newDoc) {
        if (error) {
          reject(error)
          return
        }
        resolve(newDoc)
      })
    })
  }

  function remove(db, doc) {
    return new Promise(function (resolve, reject) {
      db.remove({ _id: doc._id }, function (error, newDoc) {
        if (error) {
          reject(error)
          return
        }
        resolve(newDoc)
      })
    })
  }

  function convert (object) {
    return run(function * () {
      if (!isObject(object)) {
        return object
      }
      let copy = Array.isArray(object) ? [] : {}
      for (let i in object) {
        if (object.hasOwnProperty(i)) {
          let value = object[i]
          if (value instanceof Model) {
            yield value.save()
            copy[i] = value._id
          } else {
            copy[i] = yield convert(value)
          }
        }
      }
      return copy
    })
  }

  class Model {

    constructor (data) {
      Object.assign(this, data)
    }

    save () {
      return run(function * () {
        if (this.modelIsInserted) {
          yield update(this.constructor._db, yield convert(this))
          return this
        }
        let newModel = yield insert(this.constructor._db, yield convert(this))
        Object.defineProperties(this, {
          modelIsInserted: {
            value: true,
            configurable: true
          }
        })
        if (!this.hasOwnProperty('_id')) {
          this._id = newModel._id
        }
        this.constructor._objects[this._id] = this
        return this
      }.bind(this))
    }

    remove () {
      return run(function * () {
        if (this.modelIsInserted) {
          yield remove(this.constructor._db, this)
          delete this.constructor._objects[this._id]
          Object.defineProperties(this, {
            modelIsInserted: {
              value: false,
              configurable: true
            }
          })
        }
        return this
      }.bind(this))
    }
  }

  Object.defineProperties(Model.prototype, {
    modelIsInserted: {
      value: false,
      configurable: true
    }
  })

  Model.for = function (db) {
    let model = class extends this {}
    model._db = db
    model._objects = {}
    return model
  }

  Model.find = function (query) {
    return new ModelCursor('find', this, query)
  }

  Model.findOne = function (query) {
    return new ModelCursor('findOne', this, query)
  }

  Model.count = function (query) {
    return new ModelCursor('count', this, query)
  }

  Model.save = function (models) {
    return run.for(models, function * (model) {
      return yield model.save()
    })
  }

  Model.remove = function (models) {
    return run.for(models, function * (model) {
      return yield model.remove()
    })
  }

  let neonjs = {
    run: run,
    Model: Model
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = neonjs
  } else if (typeof window === 'object') {
    window.neonjs = neonjs
  }

}())
