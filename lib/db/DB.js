"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { mkdir, rmdirSync, stat, statSync } = require("fs")
const { dirname, resolve:resolvePath, join:joinPath } = require("path")
const { typeOf } = require("ippankiban/lib/type")

const { DBTree } = require("./DBTree")
const { EventTarget } = require("ippankiban/lib/EventTarget")
const { ReadyStateChange } = require("./ReadyStateChange")
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
            value: new Set([".json", ".yml"])
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
                process.nextTick(() => {
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

            // clear sets
            .then(() => {
                if ( dbs.get(this).has("nodes") )
                  dbs.get(this).get("branch").clear(),
                  dbs.get(this).get("fruit").clear(),
                  dbs.get(this).get("leaf").clear(),
                  dbs.get(this).get("node").clear()
                else
                  dbs.get(this).set("branch", new Set),
                  dbs.get(this).set("fruit", new Set),
                  dbs.get(this).set("leaf", new Set),
                  dbs.get(this).set("node", new Set)
            })

            //build tree
            .then(() => {
                return new Promise((resolve, reject) => {
                    const tree = new DBTree(this.root, { fruits: this.binaries, leaves: this.parsers } )
                    const onend = () => {
                        console.log("tree build end")
                        resolve()
                    }

                    tree.addEventListener("end", onend)
                })

            })

            // build list
            // .then(() => {
            //     return new Promise((resolve, reject) => {
            //         const walk = new TreeWalker(this.root, { fruits: this.binaries, leaves: this.parsers } )
            //         const onend = ({ branches, fruits, leaves, nodes }) => {
            //             walk.removeEventListener("end", onend)
            //
            //             console.log("tree walk end")
            //             /*
            //             branches.forEach(branch => dbs.get(this).get("branch").add(branch))
            //             fruits.forEach(fruit => dbs.get(this).get("fruit").add(fruit))
            //             leaves.forEach(leave => dbs.get(this).get("branch").add(leave))
            //             nodes.forEach(node => dbs.get(this).get("node").add(node))
            //             */
            //
            //             resolve()
            //         }
            //
            //         walk.addEventListener("end", onend)
            //     })
            // })

            // ready
            .then(() => {
                return new Promise((resolve, reject) => {
                    process.nextTick(() => {
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
                process.nextTick(()=> {
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
            .then(() => sync(this) ))

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
                return dbs.get(this).get("branch")
            }
        }
      , fruits: { enumerable: true,
            get: function(){
                if ( this.readyState < module.exports.DB.READY )
                  throw new Error(`db is not ready`)
                return dbs.get(this).get("fruit")
            }
        }
      , leaves: { enumerable: true,
            get: function(){
                if ( this.readyState < module.exports.DB.READY )
                  throw new Error(`db is not ready`)
                return dbs.get(this).get("leaves")
            }
        }
      , parsers: { enumerable: true,
            get: function(){  return [...dbs.get(this).get("parser")] }
        }
      , nodes: { enumerable: true,
            get: function(){
                if ( this.readyState < module.exports.DB.READY )
                  throw new Error(`db is not ready`)
                return dbs.get(this).get("node")
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
                    if ( !this.nodes.has(query) )
                      throw new Error(`nodes ${query}, does not exist`)

                    return new Promise((resolve, reject) => {
                        console.log(query)
                        resolve()
                    })
                })
                .then(node => cb(null, node))
                .catch(e => {
                    cb(e)
                    throw e
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
                .then(() => {
                    return new Promise((resolve, reject) => {
                        if ( this.readystate === module.exports.DB.READY )
                          return sync(this)

                        const onready = ({readystate}) => {
                            if ( readystate !== module.exports.DB.READY )
                              return

                            this.removeEventListener("readystatechange", onready, true)
                            sync(this)
                              .then(resolve, reject)
                        }
                        this.addEventListener("readystatechange", onready, true)
                    })
                })
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
