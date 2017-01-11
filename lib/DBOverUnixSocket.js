"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { nextTick } = process

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
        constructor: function(db){
            const { DB } = require("./DB")

            if ( !(db instanceof DB) )
              this.dispatchEvent("error", new TypeError("invalid db object")) //TODO erro

            servers.set(this, new Map)
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
                        console.log(`db over unix socket listening (${server.socket})`)

                        server.addEventListener("socket", ({socket}) => {
                            const ontextframe = e => {
                                const { query, opts } = JSON.parse(e.unmask())

                                this.db.query(query, (err, node) => {
                                    console.log("xxx query")

                                    node.read(opts, (err, data) => {
                                        socket.send(JSON.stringify({query, opts, data}))
                                    })
                                })
                            }

                            socket.addEventListener("textframe", ontextframe)
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
    }
})
