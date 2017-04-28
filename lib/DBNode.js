"use strict"

const { exec, fork, spawn, spawnSync } = require("child_process")
const { class:klass } = require("ippankiban/lib/class")
const { createInterface:createReadlineInterface } = require("readline")
const { createReadStream, stat } = require("fs")
const { extname, dirname, resolve } = require("path")
const { nextTick } = process
const { typeOf } = require("ippankiban/lib/type")
const { Serializer:{ objectify } } = require("ippankiban/lib/Serializer")


const { Event, _eventWM:events } = require("ippankiban/lib/Event")
const { Node } = require("ippankiban/lib/Node")
const { ReadyStateFul } = require("ippankiban/lib/ReadyStateFul")
const { UnixSocketServer } = require("ippanserver/lib/UnixSocketServer")

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

module.exports.DBNode = klass(Node, ReadyStateFul, statics => {
    const nodes = new WeakMap
    const by_path = new Map
    const iocp = resolve(process.cwd(), __dirname, "./io-cp.js")

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , INITIALIZING: { enumerable: true, value: 0b1 }
      , INITIALIZED: { enumerable: true, value: 0b11 }

      , UNKNOWN: { enumerable: true, value: 0b0 }
      , BRANCH: { enumerable: true, value: 0b1 }
      , LEAF: { enumerable: true, value: 0b10 }
      , FRUIT: { enumerable: true, value: 0b11 }

      , BIN_IGNORE: { enumerable: true, value: 0b100 }
      , BIN_LINK: { enumerable: true, value: 0b101 }
      , BIN_BASE64: { enumerable: true, value: 0b110 }
      , BIN_BINARY: { enumerable: true, value: 0b111 }

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

    const options_operators = new Map
    options_operators.set(null, (file, request) => file === request || file === "*" || file === undefined || file === null)

    options_operators.set("!", (file, request) => file === request || file === "*")

    options_operators.set("?=", (file, request) => {
        try {
          file = parseFloat(file)
          request = parseFloat(request)

          return file === request
        } catch(e) { return false }
    })

    options_operators.set("?<", (file, request) => {
        try {
            file = parseFloat(file)
            request = parseFloat(request)

            return file < request
        } catch(e) { return false }
    })

    options_operators.set("?>", (file, request) => {
        try {
            file = parseFloat(file)
            request = parseFloat(request)

            return file > request
        } catch(e) { return false }
    })

    options_operators.set("?>=", (file, request) => {
        try {
            file = parseFloat(file)
            request = parseFloat(request)

            return file >= request
        } catch(e) { return false }
    })

    options_operators.set("?<=", (file, request) => {
        try {
            file = parseFloat(file)
            request = parseFloat(request)

            return file <= request
        } catch(e) { return false }
    })

    const extractOptions = o => {
        const set = new Set

        Object.keys(o)
          .map(k => [k, o[k]])
          .forEach(([key, value]) => {
              if ( typeOf(value) !== "string" )
                return

              let operator = null
              let operand = null
              for ( const op of options_operators.keys() )
                if ( value.indexOf(op) == 0 ) {
                    operator = op
                    break
                }

              if ( operator ) {
                  const idx = value.search(operator)
                  const op_length = operator.length

                  operand = value.slice(idx + op_length) || operand
              } else
                  operand = value

              set.add({ key, operator, operand })
          })

        return set
    }

    const sortfns = {
        [statics.SORT.NATURAL]: (a, b) => true // don't sort
      , [statics.SORT.ALPHABETIC]: (a, b) => {
            return true //TODO
        }
      , [statics.SORT.NEWEST]: (a, b) => {
            return a.mtime > b.mtime
        }
      , [statics.SORT.OLDEST]: (a, b) => {
            return a.mtime < b.mtime
        }
    }

    return {
        constructor: function({ path, realpath, debug=false, verbose=false }, opts){
            const { leaves = new Set, fruits = new Set } = opts || {}

            Node.call(this)
            nodes.set(this, new Map)

            nodes.get(this).set("debug", debug)
            nodes.get(this).set("verbose", verbose)
            nodes.get(this).set("path", path)
            nodes.get(this).set("realpath", realpath)
            nodes.get(this).set("ext", extname(this.realpath))
            nodes.get(this).set("metapath", realpath.replace(new RegExp(`${this.extension}$`), ".meta"))
            nodes.get(this).set("meta", new Map)

            nodes.get(this).set("ready", new Promise((resolve, reject) => {
                nextTick(() => {
                    ReadyStateFul.readystateChange(this, module.exports.DBNode.INITIALIZING)
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

                    const input = createReadStream( this.metapath )
                    const lines = createReadlineInterface({ input })
                    const variables = new Map
                    const pairs = this.meta

                    const online = line => {
                        line = line.trim()
                        if ( line[0] == "#" || !line.length )
                          return
                        else if ( line[0] == "$" ) {
                            const idx = line.indexOf("=")
                            variables.set(line.slice(1, idx).trim(), line.slice(idx+1).trim())
                        }
                        else {
                            const idx = line.indexOf("=")
                            const key = line.slice(0, idx).trim()
                            let value = line.slice(idx+1).trim()

                            if ( value[0] == "[" && value[value.length-1] == "]")
                                value = value.slice(1, -1)
                                             .split(",")
                                             .map(v => v.trim())

                            pairs.set(key, value)
                        }
                    }

                    const onend = () => {
                        input.removeListener("error", onerror)
                        lines.removeListener("error", onerror)
                        lines.removeListener("line", online)
                        lines.removeListener("close", onend)

                        pairs.forEach((value, key) => {
                            variables.forEach((replace, match) => {
                                if ( typeOf(value) == "string" )
                                  value = value.replace(new RegExp(`\\$${match}`, "g"), replace)
                                else if ( typeOf(value) == "array" )
                                  value = value.map(v => v.replace(new RegExp(`\\$${match}`, "g"), replace))
                                pairs.set(key, value)
                            })
                        })

                        variables.clear()
                        resolve()
                    }

                    const onerror = e => {
                        if ( e && e.code == "ENOENT" )
                          onend()
                        else {
                          throw e
                        }
                    }

                    input.addListener("error", onerror)
                    lines.addListener("error", onerror)
                    lines.addListener("line", online)
                    lines.addListener("close", onend)
                })
            }))
            .then(() => {
                if ( by_path.has(path) )
                  by_path.get(path).dispatchEvent(new Outdate(this))
                by_path.set(path, this)
            })
            .then(() => new Promise((resolve, reject) => {
                nextTick(() => {
                    ReadyStateFul.readystateChange(this, module.exports.DBNode.INITIALIZED)
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
      , debug: { enumerable: true,
            get: function(){ return nodes.get(this).get("debug") }
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
                const opts = typeOf (args[args.length-1] ) == "string" ? function(str){
                                  let data
                                  try {
                                      data = objectify( str )
                                  } catch(e) {
                                      console.warn(e.message)
                                      return {}
                                  }

                                  return extractOptions(data)
                             }(args.pop())
                           : typeOf( args[args.length-1] ) == "object" ? extractOptions(args.pop())
                           : extractOptions({})
                const binary = rules.binary && rules.binary <= module.exports.DBNode.BIN_IGNORE && rules.binary >= module.exports.DBNode.BIN_BINARY ? rules.binary
                       : module.exports.DBNode.BIN_LINK
                const order = rules.order && rules.order >= module.exports.DBNode.SORT.NATURAL && rules.order <= module.exports.DBNode.SORT.OLDEST ? rules.order
                       : module.exports.DBNode.SORT.NATURAL
                const walk = this.type === module.exports.DBNode.BRANCH ? !!rules.walk : false

                return new Promise((resolve, reject) => {
                    if  ( this.parentNode && !this.validate(opts) ) // root node always validates
                        return reject(`[ippanFSDB DBnode.js] node does not validate meta ${[...opts].map(o => { console.log(o); return `${o.key} => ${o.operand}` }).join(", ")}`)
                    const tree = []

                    let node = this
                    while ( node ) {
                        if ( node.type == module.exports.DBNode.BRANCH ) {
                            if ( !node.parentNode || node.validate(opts) ) { // root node always validates
                                [...node.leaves, ...node.fruits]
                                  .sort(sortfns[order])
                                  .filter(child => child.validate(opts))
                                  .forEach(child => tree.unshift([node.path, child.realpath]))
                            }
                        }
                        node = node.parentNode
                    }

                    resolve(tree)
                }).then(tree => new Promise((resolve, reject) => {
                    const server = new UnixSocketServer
                    server.addEventListener("listening", e => {
                        const cp = fork(iocp, [`--socket=${server.socket}`, `--debug=${this.debug}`, `--verbose=${this.verbose}`])
                        const pid = cp.pid

                        cp.addListener("exit", code => {
                            console.log(`[${__filename}] sub task exited ${code}, attempting to delete(${server.socket})...`)
                            spawn("rm", ["-rf", server.socket])
                            server.close()
                        })

                        process.addListener("SIGINT", () => process.exit())
                        process.addListener("SIGTERM", () => process.exit())
                        process.addListener("exit", code => {
                            //spawn("rm", ["-rf", server.socket])
                            exec(`kill -9 ${pid}`)
                        })

                        server.addEventListener("socket", ({socket}) => resolve({server, socket, tree, cp}))
                    })
                }))
                .then(({server, socket, tree, cp}) => new Promise((resolve, reject) => {
                    const op = { op: "read", binary: module.exports.DBNode[binary], tree }

                    cp.addListener("message", msg => {
                        const { op, data } = JSON.parse(msg)

                        if ( op === "read" )
                          resolve(data)
                    })

                    socket.addEventListener("textframe", e => {
                        const { op, data } = JSON.parse(e.unmask())

                        if ( op === "read" )
                          resolve(data)
                        else if ( this.debug )
                          console.log("[ippanFSDB DBNode.js] <= untreated message", e.unmask())
                    })

                    socket.send(JSON.stringify(op))
                }))
                .then(data => cb(null, data))
                .catch(e => cb(e, null))
            }
        }
      , realpath: { enumerable: true,
            get: function(){ return nodes.get(this).get("realpath") }
        }
      , type: {  enumerable: true,
            get: function(){ return nodes.get(this).get("type") }
        }
      , validate: { enumerable: true,
            value: function(opts){
                for ( const {key, operator, operand} of opts )
                  if ( !options_operators.get(operator).call(this, this.meta.get(key), operand) )
                    return false
                return true
            }
        }
      , verbose: { enumerable: true,
            get: function(){ return nodes.get(this).get("verbose") }
        }
      , write: { enumerable: true,
            value: function(){
                throw new Error("todo")
            }
        }
    }
})
