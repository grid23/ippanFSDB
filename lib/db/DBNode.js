"use strict"

const { exec, fork, spawn } = require("child_process")
const { class:klass } = require("ippankiban/lib/class")
const { stat } = require("fs")
const { extname, resolve } = require("path")

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
      , branches: { enumerable: true,
            get: function(){
                return (this.childNodes || []).filter(node => node.type === module.exports.DBNode.BRANCH)
            }
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
      , path: { enumerable: true,
            get: function(){ return nodes.get(this).get("path") }
        }
      , read: { enumerable: true,
            value: function(opts){
                return new Promise((resolve, reject) => {
                    const server = new UnixSocketServer
                    server.addEventListener("listening", e => {
                        console.log("socket listening", server.socket)
                        resolve(server)
                    })
                })
                .then(server => new Promise((resolve, reject) => {
                    const cp = fork(iocp, [`--socket=${server.socket}`])
                    const pid = cp.pid

                    cp.addListener("exit", code => {
                        console.log("cp read exit") //TODO
                    })

                    process.addListener("exit", code => {
                        spawn("rm", ["-rf", server.socket])
                        exec(`kill -9 ${pid}`)
                    })

                    server.addEventListener("socket", ({socket}) => resolve({server, socket}))
                }))
                .then(({server, socket}) => new Promise((resolve, reject) => {

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
