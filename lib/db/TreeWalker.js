"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { readdir, stat } = require("fs")
const { join:joinPath, extname } = require("path")

const { Event, _eventWM } = require("ippankiban/lib/Event")
const { EventTarget } = require("ippankiban/lib/EventTarget")
const { ReadyStateChange } = require("./ReadyStateChange")

const End = klass(Event, statics => {
    const events = _eventWM

    Object.defineProperties(statics, {
        NAME: { enumerable: true, value: "end" }
    })

    return {
        constructor: function({hits, dirs, fruits, leaves}){
            Event.call(this, End.NAME)

            events.get(this).branches = dirs
            events.get(this).fruits = fruits
            events.get(this).leaves = leaves
            events.get(this).hits = hits
        }
      , branches: { enumerable: true,
            get: function(){ return events.get(this).branches }
        }
      , fruits: { enumerable: true,
            get: function(){ return events.get(this).fruits }
        }
      , leaves: { enumerable: true,
            get: function(){ return events.get(this).leaves }
        }
      , nodes: { enumerable: true,
            get: function(){ return events.get(this).hits }
        }
    }
})

module.exports.TreeWalker = klass(EventTarget, statics => {
    const walkers = new WeakMap
    const ignore = new Set([
        ".DS_Store"
    ])
    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , BUSY: { enumerable: true, value: 0b1 }
      , END: { enumerable: true, value: 0b10 }
    })

    const readyStateChange = (instance, to) => {
        const from = instance.readyState
        walkers.get(instance).set("readystate", to)
        instance.dispatchEvent(new ReadyStateChange(to, from))
    }

    return {
        constructor: function(directory, { fruits, leaves }){
            walkers.set(this, new Map)

            walkers.get(this).set("fruits", fruits && fruits[Symbol.iterator] ? new Set([...fruits]) : new Set)
            walkers.get(this).set("leaves", leaves && leaves[Symbol.iterator] ? new Set([...leaves]) : new Set)
            walkers.get(this).set("ready", new Promise((resolve, reject) => {
                process.nextTick(() => {
                    readyStateChange(this, module.exports.TreeWalker.BUSY)
                    resolve()
                })
            })
            .then(() => {
                return new Promise((resolve,reject) => {
                    stat(directory, (err, stats) => {
                        if ( err )
                          return reject(err)
                        if ( !stats.isDirectory() )
                          return reject(new Error(`${directory} is not a directory`))

                        walkers.get(this).set("root", directory)
                        resolve()
                    })
                })
            })
            .then(() => {
                const root = walkers.get(this).get("root")

                return new Promise((resolve, reject) => {
                    process.nextTick(() => {
                        const walker = function *(){
                            const toWalk = new Set("/")

                            const hits = new Set()
                            const dirs = new Set()
                            const leaves = new Set()
                            const fruits = new Set()

                            while ( toWalk.size ) {
                                const curr = [...toWalk][0]
                                toWalk.delete(curr)
                                hits.add(curr)
                                dirs.add(curr)

                                yield new Promise((resolve, reject) => {
                                    readdir(joinPath(this.root, curr), (err, nodes) => {
                                        if ( err ) reject(err)

                                        Promise.all(nodes
                                          .filter(node => !ignore.has(node))
                                          .map(node => {
                                              return new Promise((resolve, reject) => {
                                                  stat(joinPath(this.root, curr, node), (err, stats) => {
                                                      if ( err ) return reject(err)

                                                      if ( stats.isDirectory() )
                                                        toWalk.add(joinPath(curr, node))
                                                      else if ( stats.isFile() ) {
                                                          const ext = extname(node)

                                                          if ( this.fruits.has(ext) )
                                                            hits.add(joinPath(curr, node)),
                                                            fruits.add(joinPath(curr, node))
                                                          else if ( this.leaves.has(ext) )
                                                            hits.add(joinPath(curr, node)),
                                                            leaves.add(joinPath(curr, node))
                                                      }

                                                      resolve()
                                                  })
                                              })
                                          }))
                                        .then(resolve, reject)
                                    })
                                })
                            }

                            return { hits, dirs, fruits, leaves }
                        }.bind(this)

                        const walk = walker()
                        const keepwalking = () => {
                            const curr = walk.next()

                            if ( !curr.done )
                              return curr.value.then(keepwalking)
                            resolve(curr.value)
                        }
                        keepwalking()
                    })
                })
            })
            .then((files) => {
                return new Promise((resolve, reject) => {
                    process.nextTick(() => {
                        readyStateChange(this, module.exports.TreeWalker.END)

                        this.dispatchEvent(new End(files))
                        resolve()
                    })
                })
            }))
        }
      , fruits: { enumerable: true,
            get: function(){ return walkers.get(this).get("fruits") }
        }
      , leaves: { enumerable: true,
            get: function(){ return walkers.get(this).get("leaves") }
        }
      , readystate: { enumerable: true,
            get: function(){ return walkers.get(this).get("readystate") || module.exports.TreeWalker.UNINITIALIZED }
        }
      , root: { enumerable: true,
            get: function(){ return walkers.get(this).get("root") }
        }
    }
})
