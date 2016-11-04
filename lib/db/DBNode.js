"use strict"

const { exec, fork, spawn } = require("child_process")
const { class:klass } = require("ippankiban/lib/class")
const { readFile, stat } = require("fs")
const { extname, dirname, resolve } = require("path")
const { typeOf } = require("ippankiban/lib/type")

const { Event, _eventWM:events } = require("ippankiban/lib/Event")
const { Node } = require("ippankiban/lib/Node")
const { ReadyStateChange } = require("../common/ReadyStateChange")
const { UnixSocketServer } = require("ippankiban/server/UnixSocketServer")

const Outdate = klass(Event, statics => {
    Object.defineProperties(statics, {
        NAME: { enumerable: true, value: "outdate" }
    })

    return {
        constructor: function(newNode){
            Event.call(this, Outdate.NAME)
            events.get(this).newNode = newNode
        }
      , newNode: { enumerable: true,
            get: function(){ return events.get(this).newNode }
        }
    }
})

module.exports.DBNode = klass(Node, statics => {
    const nodes = new WeakMap
    const by_path = new Map
    const iocp = resolve(process.cwd(), __dirname, "../io/io-cp.js")

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , INITIALIZING: { enumerable: true, value: 0b1 }
      , INITIALIZED: { enumerable: true, value: 0b11 }

      , UNKNOWN: { enumerable: true, value: 0b0 }
      , BRANCH: { enumerable: true, value: 0b1 }
      , LEAF: { enumerable: true, value: 0b10 }
      , FRUIT: { enumerable: true, value: 0b11 }

      , BIN_IGNORE: { enumerable: true, value: "0b100" }
      , BIN_LINK: { enumerable: true, value: "0b101" }
      , BIN_BASE64: { enumerable: true, value: "0b110" }
      , BIN_BINARY: { enumerable: true, value: "0b111" }

      , [0b0]: { enumerable: true, value: "UNKNOWN" }
      , [0b1]: { enumerable: true, value: "BRANCH" }
      , [0b10]: { enumerable: true, value: "LEAF" }
      , [0b11]: { enumerable: true, value: "FRUIT" }
      , [0b100]: { enumerable: true, value: "BIN_IGNORE" }
      , [0b101]: { enumerable: true, value: "BIN_LINK" }
      , [0b110]: { enumerable: true, value: "BIN_BASE64" }
      , [0b111]: { enumerable: true, value: "BIN_BINARY" }

      , SORT: { enumerable: true,
            value: Object.create(null, {
                NATURAL: { enumerable: true, value: 0b0 }
              , ALPHABETIC: { enumerable: true, value: 0b1 }
              , NEWEST: { enumerable: true, value: 0b10 }
              , OLDEST: { enumeranle: true, value: 0b11 }

              , [0b0]: { enumerable: true, value: "NATURAL" }
              , [0b1]: { enumerable: true, value: "ALPHABETIC" }
              , [0b10]: { enumerable: true, value: "NEWEST" }
              , [0b11]: { enumerable: true, value: "OLDEST" }
            })
        }
    })

    const sortfns = {
        [statics.SORT.NATURAL]: (a, b) => false // don't sort
      , [statics.SORT.ALPHABETIC]: (a, b) => {
            return false //TODO
        }
      , [statics.SORT.NEWEST]: (a, b) => {
            return a.mtime < b.mtime // TODO ok?
        }
      , [statics.SORT.OLDEST]: (a, b) => {
            return a.mtime > b.mtime // TODO ok?
        }
    }


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
            nodes.get(this).set("ext", extname(this.realpath))
            nodes.get(this).set("metapath", realpath.replace(new RegExp(`${this.extension}$`), ".meta"))
            nodes.get(this).set("meta", new Map)

            nodes.get(this).set("ready", new Promise((resolve, reject) => {
                process.nextTick(() => {
                    readyStateChange(this, module.exports.DBNode.INITIALIZING)
                    resolve()
                })
            })
            .then(() => new Promise((resolve, reject) => {
                stat(this.realpath, (err, stats) => {
                    if ( err ) return reject(err)

                    if ( stats.isDirectory() )
                      nodes.get(this).set("type", module.exports.DBNode.BRANCH)
                    else if ( stats.isFile() ) {
                        if ( leaves.has(this.extension) )
                          nodes.get(this).set("type", module.exports.DBNode.LEAF)
                        else if ( fruits.has(this.extension) )
                          nodes.get(this).set("type", module.exports.DBNode.FRUIT)
                        else
                          nodes.get(this).set("type", module.exports.DBNode.UNKNOWN)
                    }
                    else {
                        nodes.get(this).set("type", module.exports.DBNode.UNKNOWN)
                    }

                    nodes.get(this).set("atime", +stats.atime)
                    nodes.get(this).set("ctime", +stats.ctime)
                    nodes.get(this).set("mtime", +stats.mtime)

                    resolve()
                })
            }))
            .then(() => new Promise((resolve, reject) => {
                stat(this.metapath, (err, stats) => {
                    if ( err || !stats.isFile() )
                      return resolve() // don't reject, node just has no meta data associated

                    readFile(this.metapath, (err, buffer) => {
                        if ( err )
                          return reject(err)

                        const data = JSON.parse(buffer)
                        Object.keys(data).forEach(key => this.meta.set(key, data[key]))

                        resolve()
                    })
                })
            }))
            .then(() => {
                if ( by_path.has(path) )
                  by_path.get(path).dispatchEvent(new Outdate(this))
                by_path.set(path, this)
            })
            .then(() => new Promise((resolve, reject) => {
                process.nextTick(() => {
                    readyStateChange(this, module.exports.DBNode.INITIALIZED)
                    this.dispatchEvent("ready")
                    resolve()
                })
            })))
        }
      , atime: { enumerable: true,
            get: function(){ return nodes.get(this).get("atime") }
        }
      , branches: { enumerable: true,
            get: function(){
                return (this.childNodes || []).filter(node => node.type === module.exports.DBNode.BRANCH)
            }
        }
      , ctime: { enumerable: true,
            get: function(){ return nodes.get(this).get("ctime") }
        }
      , extension: { enumerable: true,
            get: function(){ return nodes.get(this).get("ext") }
        }
      , fruits: { enumerable: true,
            get: function(){
                return (this.childNodes || []).filter(node => node.type === module.exports.DBNode.FRUIT)
            }
        }
      , leaves: { enumerable: true,
            get: function(){
                return (this.childNodes || []).filter(node => node.type === module.exports.DBNode.LEAF)
            }
        }
      , meta: { enumerable: true,
            get: function(){ return nodes.get(this).get("meta") }
        }
      , validate: { enumerable: true,
            value: function(opts){
                console.log(opts, this.realpath)
                return true
            }
        }
      , metapath: { enumerable: true,
            get: function(){ return nodes.get(this).get("metapath") }
        }
      , mtime: { enumerable: true,
            get: function(){ return nodes.get(this).get("mtime") }
        }
      , path: { enumerable: true,
            get: function(){ return nodes.get(this).get("path") }
        }
      , read: { enumerable: true,
            value: function(...args){
                const cb = typeOf(args[args.length-1]) == "function" ? args.pop() : Function.prototype
                const rules = args.length > 1 && typeOf(args[args.length-1]) == "object" ? args.pop() : {}
                const opts = typeOf( args[args.length-1] ) == "map" ? args.pop()
                           : typeOf( args[args.length-1] ) == "object" ? function(args){
                                const map = new Map
                                Object.keys(args).forEach(k => {
                                    map.set(k, args[k])
                                })

                                return map
                             }(args.pop())
                           : {}
                const binary = rules.binary && rules.binary <= module.exports.DBNode.BIN_IGNORE && rules.binary >= module.exports.DBNode.BIN_BINARY ? rules.binary
                       : module.exports.DBNode.BIN_LINK
                const order = rules.order && rules.order <= module.exports.DBNode.SORT.NATURAL && rules.order >= module.exports.DBNode.SORT.OLDEST ? rules.order
                       : module.exports.DBNode.SORT.NATURAL
                const walk = this.type === module.exports.DBNode.BRANCH ? !!rules.walk : false

                return new Promise((resolve, reject) => {
                    if  ( !this.validate(opts) )
                      return reject(`node does not validate meta ${[...opts.entries]}`)

                    const tree = []

                    let node = this
                    while ( node ) {
                        if ( node.type == module.exports.DBNode.BRANCH ) {
                            if ( node.validate(opts) ) {
                                [...node.leaves, ...node.fruits]
                                  .sort(sortfns[order])
                                  .filter(child => child.validate(opts))
                                  .forEach(child => tree.unshift(child.realpath))
                            }
                        }
                        node = node.parentNode
                    }

                    resolve(tree)
                }).then(tree => new Promise((resolve, reject) => {
                    const server = new UnixSocketServer
                    server.addEventListener("listening", e => {
                        const cp = fork(iocp, [`--socket=${server.socket}`])
                        const pid = cp.pid

                        cp.addListener("exit", code => {
                            console.log("cp read exit") //TODO
                        })

                        process.addListener("exit", code => {
                            spawn("rm", ["-rf", server.socket])
                            exec(`kill -9 ${pid}`)
                        })

                        server.addEventListener("socket", ({socket}) => resolve({server, socket, tree}))
                    })
                }))
                .then(({server, socket, tree}) => new Promise((resolve, reject) => {
                    console.log(tree)

                    socket.addEventListener("textframe", e => {
                        console.log("<= message", e.unmask())
                    })

                    socket.send("hey salut")

                }))
            }
        }
      , readystate: { enumerable: true,
            get: function(){ return nodes.get(this).get("readyState") || module.exports.DBNode.UNINITIALIZED }
        }
      , realpath: { enumerable: true,
            get: function(){ return nodes.get(this).get("realpath") }
        }
      , type: {  enumerable: true,
            get: function(){ return nodes.get(this).get("type") }
        }
      , write: { enumerable: true,
            value: function(){
                throw new Error("todo")
            }
        }
    }
})
