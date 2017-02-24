"use strict"

const { exec, fork, spawn, spawnSync } = require("child_process")
const { class:klass } = require("ippankiban/lib/class")
const { nextTick } = process
const { createReadStream, createWriteStream, mkdir, stat } = require("fs")
const { dirname, resolve:resolvePath, join:joinPath } = require("path")
const { createInterface:createReadlineInterface } = require("readline")
const { typeOf } = require("ippankiban/lib/type")
const { UID:{ uid:uuid } } = require("ippankiban/lib/UID")

const { EventTarget } = require("ippankiban/lib/EventTarget")
const { DBOverUnixSocket } = require("./DBOverUnixSocket")
const { DBTree } = require("./DBTree")
const { ReadyStateFul } = require("ippankiban/lib/ReadyStateFul")

const cwd = resolvePath(process.cwd(), dirname(process.mainModule.filename))

module.exports.DB = klass(EventTarget, ReadyStateFul, statics => {
    const dbs = new WeakMap

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , [0b0]: { enumerable: true, value: "UNINITIALIZED"}
      , INITIALIZING: { enumerable: true, value: 0b1 }
      , [0b1]: { enumerable: true, value: "INITIALIZING" }
      , SYNCING: { enumerable: true, value: 0b10 }
      , [0b10]: { enumerable: true, value: "SYNCING" }
      , BUSY: { enumerable: true, value: 0b11 }
      , [0b11]: { enumerable: true, value: "BUSY" }
      , IDLE: { enumerable: true, value: 0b100 }
      , [0b100]: { enumerable: true, value: "IDLE" }

      , binary: { enumerable: true,
            value: new Set([".js", ".css", ".gif", ".png", ".jpg"])
        }
      , forbidden_dir: { enumerable: true,
            value: new Set(["", ".", "./", "/"])
        }
      , parser: { enumerable: true,
            value: new Set([".json", ".kvp", ".yml"])
        }
    })

    const queue = (instance, resolveHandler) => function(){
        let from

        dbs.get(this).set("queue", dbs.get(this).get("queue")
          .then(() => new Promise(resolve => {
              from = this.readystate
              ReadyStateFul.readystateChange(this, module.exports.DB.BUSY)
              resolve()
          }))
          .then(resolveHandler)
          .then(data => new Promise(resolve => {
              ReadyStateFul.readystateChange(this, from)
              resolve()
          })))

        return dbs.get(this).get("queue")
    }.call(instance)

    const sync = instance => function(){
        let from
        return new Promise(resolve => {
              nextTick(() => {
                from = this.readystate
                ReadyStateFul.readystateChange(this, module.exports.DB.SYNCING)
                resolve()
              })
        })
        .then(() => new Promise((resolve, reject) => {
            const tree = new DBTree(this.root, { fruits: this.binaries, leaves: this.parsers } )
            const onend = e => {
                tree.removeEventListener("end", onend)
                dbs.get(this).set("tree", tree)

                ReadyStateFul.readystateChange(this, from)
                resolve(tree)
            }
            tree.addEventListener("end", onend)
        }))
    }.call(instance)

    return {
        constructor: function(dict){
            dict = typeOf(dict) == "object" ? dict
                 : typeOf(dict) == "string" ? { config: dict }
                 : {}

            dbs.set(this, new Map)
            dbs.get(this).set("uuid", uuid())
            dbs.get(this).set("cwd", dict.cwd || cwd)
            dbs.get(this).set("ready", Promise.resolve()
                .then(new Promise(resolve => {
                    nextTick(() => {
                        ReadyStateFul.readystateChange(this, module.exports.DB.INITIALIZING)
                        resolve()
                    })
                }))
                .then(() => new Promise(resolve => {
                    /*
                        .fsdb file read
                    */
                    const input = createReadStream( dict.config || resolvePath(this.cwd, "./.fsdb") )
                    const lines = createReadlineInterface({ input })
                    const variables = new Map
                    const pairs = new Map

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
                        resolve(pairs)
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
                }))
                .then(opts => new Promise(resolve => {
                    const mode = 0O0775 & (~process.umask())
                    opts.set("TMP", resolvePath("/tmp", `./${this.uuid}`))

                    mkdir(opts.get("TMP"), mode, err => {
                        if ( err ) throw err

                        process.addListener("SIGINT", () => process.exit())
                        process.addListener("SIGTERM", () => process.exit())
                        process.addListener("exit", function(path){
                            return function(){
                              console.log(`[ippanFSDB] attempting to delete ${path}`)
                              spawn("rm", ["-rf", path])
                            }
                        }(opts.get("TMP")))

                        resolve(opts)
                    })
                }))
                .then(opts => new Promise((resolve, reject) => {
                    const targets = new Set
                    const root = dict.root || opts.get("root")

                    console.log(`\tattempt to resolve possible path for ${root}`)

                    if ( module.exports.DB.forbidden_dir.has(root) )
                      throw new Error(`${root} is forbidden`)

                    targets.add( resolvePath(this.cwd, root) )
                    targets.add( resolvePath(dirname(module.filename), root) )
                    targets.add( resolvePath("/", root) )

                    Promise.all([...targets].map(target => {
                        return new Promise((resolve, reject) => {
                            stat(target, (err, stats) => {
                                if ( err ) {
                                    return reject( err )
                                    console.log(`\t\t... ${target} NOK`)
                                }

                                if ( !stats.isDirectory() ) {
                                    return reject( new Error(`${target} is not a folder`) )
                                    console.log(`\t\t... ${target} NOK`)
                                }

                                console.log(`\t\t... ${target} OK`)
                                resolve(target)
                            })
                        })
                        .catch(e => null)
                    }))
                    .then(targets => targets.filter(v => !!v))
                    .then(targets => {
                        if ( !targets.length  ) {
                            return reject(new Error(`unable to resolve a valid path for ${root}`))
                        }
                        if ( targets.length > 1 ) {
                            return reject(new Error(`more than one path is resolvable for ${root}`))
                        }

                        console.log(`\tdirectory ${targets[0]} will be used`)
                        opts.set("TARGET", targets[0])
                        resolve(opts)
                    })
                }))
                .then(opts => new Promise(resolve => {
                      const binaries = function(bin){
                          if ( typeOf(bin) == "string" )
                            return bin.split(",")
                                   .map(a => a.trim())
                                   .filter(a => !!v)
                          else return bin
                      }(dict.binaries || opts.get("binaries"))
                      const parsers = function(par){
                          if ( typeOf(par) == "string" )
                            return par.split(",")
                                   .map(a => a.trim())
                                   .filter(a => !!v)
                          else return par
                      }(dict.parsers || opts.get("parsers"))
                      const socket = dict.socket || opts.get("socket")
                                   ? resolvePath(this.cwd, dict.socket || opts.get("socket"))
                                   : null

                      dbs.get(this).set("root", opts.get("root"))
                      dbs.get(this).set("binary", binaries && binaries[Symbol.iterator] ? new Set([...binaries]) : new Set([...module.exports.DB.binary]))
                      dbs.get(this).set("parser", parsers && parsers[Symbol.iterator] ? new Set([...parsers]) : new Set([...module.exports.DB.parser]))
                      dbs.get(this).set("socket", socket)

                      opts.clear()
                      resolve()
                }))
              .then(() => new Promise(resolve => {
                  if ( !this.socket )
                    return resolve()

                  const server = new DBOverUnixSocket(this)
                  resolve()
              }))
              .then(() => sync(this))
              .then(() => new Promise(resolve => {
                  nextTick(() => {
                      ReadyStateFul.readystateChange(this, module.exports.DB.IDLE)
                      resolve()
                  })
              })))

              dbs.get(this).set("queue", dbs.get(this).get("ready"))
        }
      , binaries: { enumerable: true,
            get: function(){ return [...dbs.get(this).get("binary")] }
        }
      , branches: { enumerable: true,
            get: function(){
                if ( this.tree )
                  return [...this.tree.branches]
                return null
            }
        }
      , cwd: { enumerable: true,
          get: function(){ return dbs.get(this).get("cwd") }
        }
      , fruits: { enumerable: true,
            get: function(){
                if ( this.tree )
                  return [...this.tree.fruits]
                return null
            }
        }
      , leaves: { enumerable: true,
            get: function(){
                if ( this.tree )
                  return [...this.tree.leaves]
                return null
            }
        }
      , nodes: { enumerable: true,
            get: function(){
                if ( this.tree )
                  return [...this.tree.nodes]
                return null
            }
        }
      , parsers: { enumerable: true,
            get: function(){  return [...dbs.get(this).get("parser")] }
        }
      , query: { enumerable: true,
            value: function(query, cb){
                query = typeOf(query) == "string" ? resolvePath("/", query) : function(){ throw new TypeError(`string query expected`) }()
                cb = typeOf(cb) == "function" ? cb : Function.prototype

                return queue(this, () => new Promise(resolve=> {
                    if ( !this.tree.nodes.has(query) ) {
                        throw new Error(`nodes ${query}, does not exist`)
                    }

                    const node = this.tree.nodes.get(query)
                    cb(null, node)
                    resolve(node)
                }).catch(e => cb(e, null)))
            }
        }
      , root: { enumerable: true,
            get: function(){ return dbs.get(this).get("root") }
        }
      , tree: { enumerable: true,
            get: function(){ return dbs.get(this).get("tree") }
        }
      , socket: { enumerable: true,
            get: function(){ return dbs.get(this).get("socket") }
        }
      , sync: {  enumerable: true,
            value: function(){
                return queue(this, () => sync(this))
            }
        }
      , uuid: { enumerable: true,
            get: function(){ return dbs.get(this).get("uuid") }
        }
    }
})
