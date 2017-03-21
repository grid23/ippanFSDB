"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { nextTick } = process
const { spawnSync } = require("child_process")

const { EventTarget } = require("ippankiban/lib/EventTarget")
const { ReadyStateFul } = require("ippankiban/lib/ReadyStateFul")
const { UnixSocketServer } = require("ippanServer/lib/UnixSocketServer")

module.exports.DBOverUnixSocket = klass(EventTarget, ReadyStateFul, statics => {
    const servers = new WeakMap

    Object.defineProperties(statics, {
          UNINITIALIZED: { enumerable: true, value: 0b0 }
        , [0b0]: { enumerable: true, value: "UNINITIALIZED"}
        , INITIALIZING: { enumerable: true, value: 0b1 }
        , [0b1]: { enumerable: true, value: "INITIALIZING" }
        , BUSY: { enumerable: true, value: 0b10 }
        , [0b10]: { enumerable: true, value: "BUSY" }
        , IDLE: { enumerable: true, value: 0b11 }
        , [0b11]: { enumerable: true, value: "IDLE" }
    })

    return {
        constructor: function({db, debug=false, verbose=false} = {}){
            const { DB } = require("./DB")

            if ( !(db instanceof DB) )
              this.dispatchEvent("error", new TypeError("invalid db object")) //TODO erro

            servers.set(this, new Map)
            servers.get(this).set("debug", debug)
            servers.get(this).set("verbose", verbose)
            servers.get(this).set("db", db)
            servers.get(this).set("ready", Promise.resolve()
                .then(() => new Promise(resolve => {
                    nextTick(() => {
                        ReadyStateFul.readystateChange(this, module.exports.DBOverUnixSocket.INITIALIZING)
                        resolve()
                    })
                }))
                .then(() => new Promise(resolve => {
                    const server = new UnixSocketServer(this.db.socket)

                    server.addEventListener("listening", e => {
                        if ( this.verbose )
                          console.log(`db over unix socket listening (${server.socket})`)

                        server.addEventListener("socket", ({socket}) => {
                            const ontextframe = e => {
                                const { query, opts } = JSON.parse(e.unmask())

                                const onerror = err => {
                                    socket.send(JSON.stringify({
                                        error: err.message
                                      , query, opts
                                    }))
                                }

                                this.db.query(query, (err, node) => {
                                    if ( err )
                                      return onerror(err)

                                    node.read(opts, (err, data) => {
                                        if ( err )
                                          return onerror(err)

                                        socket.send(JSON.stringify({query, opts, data}))
                                    })
                                })
                            }

                            const onclose = e => {
                                socket.removeEventListener("textframe", ontextframe)
                                socket.removeEventListener("close", onclose)
                            }

                            socket.addEventListener("textframe", ontextframe)
                            socket.addEventListener("close", onclose)
                        })

                        resolve()
                    })
                }))
                .then(() => new Promise(resolve => {
                    nextTick(() => {
                        ReadyStateFul.readystateChange(this, module.exports.DBOverUnixSocket.IDLE)
                        resolve()
                    })
                })))
        }
      , db: { enumerable: true,
            get: function(){ return servers.get(this).get("db") }
        }
      , debug: { enumerable: true,
            get: function(){ return servers.get(this).get("debug") }
        }
      , verbose: { enumerable: true,
            get: function(){ return servers.get(this).get("verbose") }
        }
    }
})
