"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { stat } = require("fs")
const { typeOf } = require("ippankiban/lib/type")

const { Socket:NetSocket } = require("net")
const { Node } = require("ippankiban/lib/Node")

module.exports.DBQIOverSocket = klass(Node, statics => {
    const qis = new WeakMap

    const d_binaries = require("./d_binaries")
    const d_parsers = require("./d_parsers")
    const forbidden = require("./forbidden")

    return {
        constructor: function(root, { binaries, parsers }){
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

            ])
            .catch(e => console.error(e)) //TODO
            .then(([root, {binaries, parsers}]) => {
                qis.get(this).set("root", root)
                qis.get(this).set("binaries", binaries)
                qis.get(this).set("parsers", parsers)
                console.log(root, binaries, parsers)
            }))

            process.addListener("message", ({data, socket}) => {
                qis.get(this).get("ready").then(() => {
                    console.log(data, socket)

                    const netSocket = new NetSocket
                    netSocket.on("end", e => {

                    })

                    netSocket.on("connect", () => {
                        netSocket.end(JSON.stringify({res: "coucou"}))
                    })

                    netSocket.connect(socket)
                })
            })
        }
    }
})
