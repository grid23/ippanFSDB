"use struct"

const { class:klass } = require("ippankiban/lib/class")
const { readdir, stat } = require("fs")
const { join:joinPath, extname } = require("path")

const { DBNode } = require("./DBNode")
const { Event, _eventWM } = require("ippankiban/lib/Event")
const { ReadyStateChange } = require("../common/ReadyStateChange")
const { Node } = require("ippankiban/lib/Node")

const End = klass(Event, statics => {
    const events = _eventWM

    Object.defineProperties(statics, {
        NAME: { enumerable: true, value: "end" }
    })

    return {
        constructor: function({ dbNodes, branches, leaves, fruits }){
            Event.call(this, End.NAME)

            events.get(this).nodes = dbNodes
            events.get(this).branches = branches
            events.get(this).leaves = leaves
            events.get(this).fruits = fruits
        }
      , branches: { enumerable: true,
            get: function(){ return events.get(this).branches  }
        }
      , fruits: { enumerable: true,
            get: function(){ return events.get(this).fruits  }
        }
      , leaves: { enumerable: true,
            get: function(){ return events.get(this).leaves  }
        }
      , nodes: { enumerable: true,
            get: function(){ return events.get(this).nodes  }
        }
    }
})

module.exports.DBTree = klass(Node, statics => {
    const trees = new WeakMap

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , BUSY: { enumerable: true, value: 0b1 }
      , END: { enumerable: true, value: 0b10 }
    })

    const ignore = new Set([
        ".DS_Store"
      , ".meta"
    ])

    const ignorefilter = node => !ignore.has(node)

    const readyStateChange = (instance, to) => {
        const from = instance.readyState

        trees.get(instance).set("readystate", to)
        instance.dispatchEvent(new ReadyStateChange(to, from))
    }

    return {
        constructor: function(directory, { fruits, leaves }){
            Node.call(this)
            trees.set(this, new Map)
            trees.get(this).set("fruits", fruits && fruits[Symbol.iterator] ? new Set([...fruits]) : new Set)
            trees.get(this).set("leaves", leaves && leaves[Symbol.iterator] ? new Set([...leaves]) : new Set)
            trees.get(this).set("ready", new Promise((resolve, reject) => {
                process.nextTick(() => {
                    readyStateChange(this, module.exports.DBTree.BUSY)
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

                        trees.get(this).set("root", directory)
                        resolve()
                    })
                })
            })
            .then(() => new Promise((resolve, reject) => {
                const walker = function *(){
                    const dbNodes = new Map
                    const branches = new Map
                    const leaves = new Map
                    const fruits = new Map

                    const dbRootNode = new DBNode({ path:"/", realpath: this.root })

                    yield new Promise((resolve, reject) => {
                        dbRootNode.addEventListener("ready", function onready(){
                            dbRootNode.removeEventListener("ready", onready)
                            branches.set(dbRootNode.path, dbRootNode)
                            dbNodes.set(dbRootNode.path, dbRootNode)
                            resolve()
                        })
                    })

                    const toWalk = [dbRootNode]

                    while ( toWalk.length ) {
                        const curr = toWalk.shift()

                        yield new Promise((resolve, reject) => {
                            readdir(curr.realpath, (err, nodes) => {
                                if ( err ) reject(err)

                                nodes = nodes.filter(ignorefilter)
                                Promise.all(nodes.map(node => {
                                    return new Promise((resolve, reject) => {
                                        const realpath = joinPath(curr.realpath, node)
                                        const path = joinPath(curr.path, node)

                                        const dbNode = new DBNode({ path, realpath }, { leaves: this.leaves, fruits: this.fruits })
                                        dbNode.addEventListener("ready", function onready(){
                                            dbNode.removeEventListener("ready", onready)

                                            curr.appendChild(dbNode)
                                            dbNodes.set(dbNode.path, dbNode)
                                            if ( dbNode.type === DBNode.BRANCH ) {
                                                branches.set(dbNode.path, dbNode)
                                                toWalk.push(dbNode)
                                            }
                                            else if ( dbNode.type === DBNode.LEAF )
                                              leaves.set(dbNode.path, dbNode)
                                            else if (dbNode.type === DBNode.FRUIT )
                                              fruits.set(dbNode.path, dbNode)

                                            resolve()
                                        })
                                    })
                                }))
                                .then(resolve, reject)
                            })
                        })
                    }

                    return { dbNodes, branches, leaves, fruits }
                }.bind(this)

                const walk = walker()
                const keepwalking = () => {
                    const curr = walk.next()

                    if ( !curr.done )
                      return curr.value.then(keepwalking)
                    resolve(curr.value)
                }
                keepwalking()
            }))
            .then(({ dbNodes, branches, leaves, fruits }) => new Promise((resolve, reject) => {
                process.nextTick(() => {
                    readyStateChange(this, module.exports.DBTree.END)

                    this.dispatchEvent(new End({ dbNodes, branches, leaves, fruits }))
                    resolve()
                })
            })))
        }
      , readystate: { enumerable: true,
            get: function(){ return trees.get(this).get("readystate") || module.exports.DBTree.UNINITIALIZED }
        }
      , fruits: { enumerable: true,
            get: function(){ return trees.get(this).get("fruits") }
        }
      , leaves: { enumerable: true,
            get: function(){ return trees.get(this).get("leaves") }
        }
      , root: { enumerable: true,
            get: function(){ return trees.get(this).get("root") }
        }
    }
})
