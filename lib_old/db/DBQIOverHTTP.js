"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { stat } = require("fs")
const { typeOf } = require("ippankiban/lib/type")

const { DBQuery } = require("./DBQuery")
const { SecureServer } = require("ippankiban/server/SecureServer")
const { Server } = require("ippankiban/server/Server")
const { Node } = require("ippankiban/lib/Node")
const { WebSocketUpgrade } = require("ippankiban/server/WebSocketUpgrade")

module.exports.DBQIOverHTTP = klass(Node, statics => {
    const qis = new WeakMap

    const d_binaries = require("../d_binaries")
    const d_parsers = require("../d_parsers")
    const forbidden = require("../forbidden")

    return {
        constructor: function(root, { binaries, parsers, port, secure, ca, crt, key }){
            Node.call(this)
            qis.set(this, new Map)
            qis.get(this).set("binary", binaries||d_binaries)
            qis.get(this).set("parser", parsers||d_parser)

            qis.get(this).set("ready", Promise.all([

                new Promise((resolve, reject) => {
                    if ( forbidden.has(root) )
                      return reject( new Error(`${root} is forbidden`) )

                    stat(root, (err, stats) => {
                        if ( err )
                          return reject( err )
                        if ( !stats.isDirectory() )
                          return reject( new Error(`${root} is not a folder`) )
                        resolve(root)
                    })
                })
              , new Promise((resolve, reject) => {
                    binaries = binaries[Symbol.iterator]
                             ? new Set([...binaries].filter(binary => typeOf(binary) == "string"))
                             : d_binaries
                    parsers = parsers[Symbol.iterator]
                            ? new Set([...parsers].filter(parser => typeOf(parser) == "string"))
                            : d_parsers

                    resolve({ binaries, parsers })
                })
              , new Promise((resolve, reject) => {
                    if ( !!secure )
                      qis.get(this).set("server", new SecureServer({ ca, crt, key }))
                    else
                      qis.get(this).set("server", new Server())

                    qis.get(this).set("websocket", new WebSocketUpgrade(qis.get(this).get("server")))

                    let listentimer = setTimeout(() => reject(new Error("server won't listen")), 5000)

                    qis.get(this).get("server").addListener("listening", e => {
                        clearTimeout(listentimer)
                        resolve()
                    })

                    qis.get(this).get("server").listen(port)
                })
            ])
            .catch(e => console.error(e)) //TODO
            .then(([root, {binaries, parsers}]) => {
                qis.get(this).set("root", root)
                qis.get(this).set("binaries", binaries)
                qis.get(this).set("parsers", parsers)

                process.send("ready")
            }))

            qis.get(this).get("ready").then(() => {
                const ws = qis.get(this).get("websocket")

                ws.addEventListener("socket", ({socket}) => {
                    socket.addEventListener("text", e => {
                        let payload = e.unmask()

                        try { payload = JSON.parse(payload) }
                        catch(e){ return console.error(e) } //TODO

                        const { cmd, path } = payload

                        const query = new DBQuery(this.dictionary, { path })

                        query.addEventListener("ready", e=> {
                            socket.message(JSON.stringify({
                                cmd: "query"
                              , id: query.uuid
                            }))
                        })
                    })
                })

            })
        }
      , dictionary: { enumerable: true,
            get: function(){
                return {
                    root: qis.get(this).get("root")
                  , binaries: qis.get(this).get("binaries")
                  , parsers: qis.get(this).get("parsers")
                }
            }
        }
    }
})
