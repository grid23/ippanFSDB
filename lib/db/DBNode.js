"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { stat } = require("fs")
const { extname } = require("path")

const { Node } = require("ippankiban/lib/Node")
const { ReadyStateChange } = require("./ReadyStateChange")

module.exports.DBNode = klass(Node, statics => {
    const nodes = new WeakMap

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , INITIALIZING: { enumerable: true, value: 0b1 }
      , INITIALIZED: { enumerable: true, value: 0b11 }

      , UNKNOWN: { enumerable: true, value: 0b0 }
      , BRANCH: { enumerable: true, value: 0b1 }
      , LEAF: { enumerable: true, value: 0b10 }
      , FRUIT: { enumerable: true, value: 0b11 }

      , [0b0]: { enumerable: true, value: "UNKNOWN" }
      , [0b1]: { enumerable: true, value: "BRANCH" }
      , [0b10]: { enumerable: true, value: "LEAF" }
      , [0b11]: { enumerable: true, value: "FRUIT" }
    })

    const readyStateChange = (instance, to) => {
        const from = instance.readyState

        nodes.get(instance).set("readystate", to)
        instance.dispatchEvent(new ReadyStateChange(to, from))
    }

    return {
        constructor: function({ path, realpath }, opts){
            const { leaves = new Set, fruits = new Set } = opts || {}

            Node.call(this)
            nodes.set(this, new Map)

            nodes.get(this).set("path", path)
            nodes.get(this).set("realpath", realpath)

            nodes.get(this).set("ready", new Promise((resolve, reject) => {
                process.nextTick(() => {
                    readyStateChange(this, module.exports.DBNode.INITIALIZING)
                    resolve()
                })
            })
            .then(() => new Promise((resolve, reject) => {
                stat(realpath, (err, stats) => {
                    if ( err ) return reject(err)

                    if ( stats.isDirectory() )
                      nodes.get(this).set("type", module.exports.DBNode.BRANCH)
                    else {
                        const ext = extname(this.realpath)

                        if ( leaves.has(ext) )
                          nodes.get(this).set("type", module.exports.DBNode.LEAF)
                        else if ( fruits.has(ext) )
                          nodes.get(this).set("type", module.exports.DBNode.FRUIT)
                        else
                          nodes.get(this).set("type", module.exports.DBNode.UNKNOWN)
                    }

                    resolve()
                })
            }))
            .then(() => new Promise((resolve, reject) => {
                process.nextTick(() => {
                    readyStateChange(this, module.exports.DBNode.INITIALIZED)
                    this.dispatchEvent("ready")
                    resolve()
                })
            })))
        }
      , db: { enumerable: true,
            get: function(){ return nodes.get(this).get("db") }
        }
      , fruits: { enumerable: true,
            get: function(){  return nodes.get(this).get("fruits") }
        }
      , leaves: { enumerable: true,
            get: function(){ return nodes.get(this).get("leaves") }
        }
      , path: { enumerable: true,
            get: function(){ return nodes.get(this).get("path") }
        }
      , read: { enumerable: true,
            get: function(opts){

            }
        }
      , readystate: { enumerable: true,
            get: function(){ return nodes.get(this).get("readyState") || module.exports.DBNode.UNINITIALIZED }
        }
      , realpath: { enumerable: true,
            get: function(){ return nodes.get(this).get("realpath") }
        }
      , tree: { enumerable: true,
            get: function(){ return nodes.get(this).get("tree") }
        }
      , type: {  enumerable: true,
            get: function(){ return nodes.get(this).get("type") } //return a string
        }
      , write: { enumerable: true,
            value: function(){}
        }
    }
})
