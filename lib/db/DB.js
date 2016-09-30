"use strict"

const {class:klass} = require("ippankiban/lib/class")
const {stat, statSync} = require("fs")
const { dirname, resolve:resolvePath } = require("path")

const {EventTarget} = require("ippankiban/lib/EventTarget")
const {ReadyStateChange} = require("./ReadyStateChange")

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
      , INITIALIZED: { enumerable: true, value: 0b10 }

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

    return {
        constructor: function({ root }){
            dbs.set(this, new Map)
            dbs.get(this).set("ready", new Promise(resolve => {
                process.nextTick(()=> {
                    const from = this.readystate
                    const to = module.exports.DB.INITIALIZING
                    dbs.get(this).set("readystate", to)
                    this.dispatchEvent(new ReadyStateChange(to, from))

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
            .then(()=>{
                const from = this.readystate
                const to = module.exports.DB.INITIALIZED
                dbs.get(this).set("readystate", to)
                this.dispatchEvent(new ReadyStateChange(to, from))
            }))
        }
      , readystate: { enumerable: true,
            get: function(){
                return dbs.get(this).get("readyState") || module.exports.DB.UNINITIALIZED
            }
        }
      , query: { enumerable: true,
            value: function(){
              
            }
        }
    }
})
