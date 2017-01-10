"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { mkdir, rmdirSync, stat, statSync } = require("fs")
const { dirname, resolve:resolvePath, join:joinPath } = require("path")
const { typeOf } = require("ippankiban/lib/type")
const { nextTick } = process

const { DBTree } = require("./DBTree")
const { EventTarget } = require("ippankiban/lib/EventTarget")
const { ReadyStateChange } = require("../common/ReadyStateChange")
const { TreeWalker } = require("./TreeWalker")
const { UID:{ uid:uuid } } = require("ippankiban/lib/UID")

module.exports.DB = klass(EventTarget, statics => {
    const dbs = new WeakMap

    let tmp_dir = ["darwin", "linux", "freebsd"].indexOf(process.platform) !== -1
                ? "/tmp"
                // : process.platform == "win32"
                // ? "" //TODO
                : void function(){ console.warn("unspecified tmp path for the current platform") }()

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , INITIALIZING: { enumerable: true, value: 0b1 }
      , SYNCING: { enumerable: true, value: 0b10 }
      , READY: { enumerable: true, value: 0b11 }
      , BUSY: { enumerable: true, value: 0b100 }

      , binary: { enumerable: true,
            value: new Set([".js", ".css", ".gif", ".png", ".jpg"])
        }
      , forbidden_dir: { enumerable: true,
            value: new Set(["", ".", "./", "/"])
        }
      , parser: { enumerable: true,
            value: new Set([".json", ".", ".yml"])
        }
      , tmp_dir: { enumerable: true,
            get: () => tmp_dir
          , set: v => {
                if ( !statSync(v).isDirectory() )
                  throw new Error(`path ${v} must be an existing directory`)
                tmp_dir = v
            }
        }
    })

    const readyStateChange = (instance, to) => {
        const from = instance.readyState
        dbs.get(instance).set("readystate", to)
        instance.dispatchEvent(new ReadyStateChange(to, from))
    }

    const sync = instance => {
        return function(){
            return new Promise((resolve, reject) => {
                nextTick(() => {
                    readyStateChange(this, module.exports.DB.SYNCING)
                    resolve()
                })
            })

            // create tmp folder
            .then(() => {
                return new Promise((resolve, reject) => {
                    const dir = resolvePath(tmp_dir, this.uuid)

                    stat(dir, (err, stats) => {
                        if ( err )
                          return mkdir(dir, err => {
                              if ( err ) return reject(err)
                              resolve(dir)
                          })

                        if ( stats.isDirectory() )
                          return rmdir(dir, err => {
                              if ( err ) return reject(err)

                              mkdir(dir, err => {
                                  if ( err ) return reject(err)
                                  resolve(dir)
                              })
                          })

                        throw new Error(`${dir} is occupied by an unexpected file`)
                    })
                })
            })
            .then(tmp => dbs.get(this).set("tmp", tmp))

            //build tree
            .then(() => {
                return new Promise((resolve, reject) => {
                    const tree = new DBTree(this.root, { fruits: this.binaries, leaves: this.parsers } )
                    const onend = ({ nodes, branches, fruits, leaves }) => {

                        if ( dbs.get(this).has("nodes") )
                          dbs.get(this).get("branches").clear(),
                          dbs.get(this).get("fruits").clear(),
                          dbs.get(this).get("leaves").clear(),
                          dbs.get(this).get("nodes").clear()
                        dbs.get(this).set("branches", branches)
                        dbs.get(this).set("fruits", fruits)
                        dbs.get(this).set("leaves", leaves)
                        dbs.get(this).set("nodes", nodes)

                        resolve()
                    }

                    tree.addEventListener("end", onend)
                })

            })

            // ready
            .then(() => {
                return new Promise((resolve, reject) => {
                    nextTick(() => {
                        readyStateChange(this, module.exports.DB.READY)
                        resolve()
                    })
                })
            })
        }.call(instance)
    }

    return {
        constructor: function({ root, binaries, parsers }){
            dbs.set(this, new Map)
            dbs.get(this).set("uuid", uuid())

            dbs.get(this).set("binary", binaries && binaries[Symbol.iterator] ? new Set([...binaries]) : new Set([...module.exports.DB.binary]))
            dbs.get(this).set("parser", parsers && parsers[Symbol.iterator] ? new Set([...parsers]) : new Set([...module.exports.DB.parser]))
            dbs.get(this).set("ready", new Promise(resolve => {
                nextTick(()=> {
                    readyStateChange(this, module.exports.DB.INITIALIZING)
                    resolve()
                })
            })
            .then(() => {
                return new Promise((resolve, reject) => {
                    console.log(`\tattempt to resolve possible path for ${root}`)

                    if ( module.exports.DB.forbidden_dir.has(root) )
                      throw new Error(`${root} is forbidden`)

                    const targets = new Set
                    targets.add( resolvePath(dirname(module.parent.filename), root) )
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
                        dbs.get(this).set("root", targets[0])
                        resolve(targets[0])
                    })
                })
            })
            .then(() => sync(this)))

            const onexit = code => {
                try {
                    rmdirSync( dbs.get(this).get("tmp") )
                } catch(e) {}
            }

            process.addListener("SIGINT", onexit)
            process.addListener("SIGTERM", onexit)
            process.addListener("exit", onexit)
        }
      , binaries: { enumerable: true,
            get: function(){ return [...dbs.get(this).get("binary")] }
        }
      , branches: { enumerable: true,
            get: function(){
                if ( this.readyState < module.exports.DB.READY )
                  throw new Error(`db is not ready`)
                return dbs.get(this).get("branches")
            }
        }
      , getBranches: { enumerable: true,
            value: function(cb){
                cb = typeOf(cb) === "function" ? cb : Function.prototype
                return dbs.get(this).get("ready")
                .then(() =>{
                    new Promise((resolve, reject) => {
                        const onreadystatechange = ({readystate}) => {
                            if ( readystate !== module.exports.DB.READY )
                              return
                            this.removeEventListener("readystatechange", onreadystatechange)
                            resolve()
                        }
                        if ( this.readyState !== module.exports.DB.READY )
                          this.addEventListener("readystatechange", onreadystatechange)
                        else
                          resolve()
                    })
                })
                .then(() => {
                    const nodes = [...dbs.get(this).get("branches")]
                    cb(null, nodes)

                    return nodes
                })
            }
        }
      , fruits: { enumerable: true,
            get: function(){
                if ( this.readyState < module.exports.DB.READY )
                  throw new Error(`db is not ready`)
                return dbs.get(this).get("fruits")
            }
        }
      , getFruits: { enumerable: true,
            value: function(cb){
                cb = typeOf(cb) === "function" ? cb : Function.prototype
                return dbs.get(this).get("ready")
                .then(() =>{
                    new Promise((resolve, reject) => {
                        const onreadystatechange = ({readystate}) => {
                            if ( readystate !== module.exports.DB.READY )
                              return
                            this.removeEventListener("readystatechange", onreadystatechange)
                            resolve()
                        }
                        if ( this.readyState !== module.exports.DB.READY )
                          this.addEventListener("readystatechange", onreadystatechange)
                        else
                          resolve()
                    })
                })
                .then(() => {
                    const nodes = [...dbs.get(this).get("fruits")]
                    cb(null, nodes)

                    return nodes
                })
            }
        }
      , leaves: { enumerable: true,
            get: function(){
                if ( this.readyState < module.exports.DB.READY )
                  throw new Error(`db is not ready`)
                return dbs.get(this).get("leaves")
            }
        }
      , getLeaves: { enumerable: true,
            value: function(cb){
                cb = typeOf(cb) === "function" ? cb : Function.prototype
                return dbs.get(this).get("ready")
                .then(() =>{
                    new Promise((resolve, reject) => {
                        const onreadystatechange = ({readystate}) => {
                            if ( readystate !== module.exports.DB.READY )
                              return
                            this.removeEventListener("readystatechange", onreadystatechange)
                            resolve()
                        }
                        if ( this.readyState !== module.exports.DB.READY )
                          this.addEventListener("readystatechange", onreadystatechange)
                        else
                          resolve()
                    })
                })
                .then(() => {
                    const nodes = [...dbs.get(this).get("leaves")]
                    cb(null, nodes)

                    return nodes
                })
            }
        }
      , parsers: { enumerable: true,
            get: function(){  return [...dbs.get(this).get("parser")] }
        }
      , nodes: { enumerable: true,
            get: function(){
                if ( this.readyState < module.exports.DB.READY )
                  throw new Error(`db is not ready`)
                return dbs.get(this).get("nodes")
            }
        }
      , getNodes: { enumerable: true,
            value: function(cb){
                cb = typeOf(cb) === "function" ? cb : Function.prototype
                return dbs.get(this).get("ready")
                .then(() =>{
                    new Promise((resolve, reject) => {
                        const onreadystatechange = ({readystate}) => {
                            if ( readystate !== module.exports.DB.READY )
                              return
                            this.removeEventListener("readystatechange", onreadystatechange)
                            resolve()
                        }
                        if ( this.readyState !== module.exports.DB.READY )
                          this.addEventListener("readystatechange", onreadystatechange)
                        else
                          resolve()
                    })
                })
                .then(() => {
                    const nodes = [...dbs.get(this).get("nodes")]
                    cb(null, nodes)

                    return nodes
                })
            }
        }
      , query: { enumerable: true,
            value: function(query, cb){
                query = typeOf(query) == "string" ? resolvePath("/", query) : function(){ throw new TypeError(`string query expected`) }()
                cb = typeOf(cb) == "function" ? cb : Function.prototype

                return dbs.get(this).get("ready")
                .then(() =>{
                    new Promise((resolve, reject) => {
                        const onreadystatechange = ({readystate}) => {
                            if ( readystate !== module.exports.DB.READY )
                              return
                            this.removeEventListener("readystatechange", onreadystatechange)
                            resolve()
                        }
                        if ( this.readyState !== module.exports.DB.READY )
                          this.addEventListener("readystatechange", onreadystatechange)
                        else
                          resolve()
                    })
                })
                .then(() => {
                    if ( !this.nodes.has(query) ) {
                        const err = new Error(`nodes ${query}, does not exist`)
                        cb(err, null)
                        return reject(err)
                    }

                    return new Promise((resolve, reject) => {
                        const node = this.nodes.get(query)
                        cb(null, node)
                        resolve(node)
                    })
                })
            }
        }
      , readystate: { enumerable: true,
            get: function(){ return dbs.get(this).get("readyState") || module.exports.DB.UNINITIALIZED }
        }
      , root: { enumerable: true,
            get: function(){ return dbs.get(this).get("root") }
        }
      , sync: { enumerable: true,
          value: function(){
              return dbs.get(this).get("ready")
                .then(() => new Promise((resolve, reject) => {
                    console.log("x", this.readystate)
                    if ( this.readystate === module.exports.DB.READY ) {
                        sync(this).then(resolve, reject)
                        return
                    }
                    console.log("a")
                    const onready = ({readystate}) => {
                        console.log("w")
                        if ( readystate !== module.exports.DB.READY )
                          return

                        this.removeEventListener("readystatechange", onready, true)
                        console.log("y")
                        sync(this).then(resolve, reject)
                    }
                    this.addEventListener("readystatechange", onready, true)
                }))
          }
        }
      , tmp: { enumerable: true,
            get: function(){
                if ( this.readyState < module.exports.DB.SYNCING )
                  throw new Error(`db is not ready`)
                return dbs.get(this).get("tmp")
            }
        }
      , uuid: { enumerable: true,
            get: function(){ return dbs.get(this).get("uuid") }
        }
    }
})
