"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { extname } = require("path")
const { nextTick } = process

const { EventTarget } = require("ippankiban/lib/EventTarget")
const { UnixSocket } = require("ippanServer/lib/UnixSocket")

const { JsonParser } = require("./JsonParser")
const { KvpParser } = require("./KvpParser")
const { YamlParser } = require("./YamlParser")

module.exports.IO = klass(EventTarget, statics => {
    const ios = new WeakMap

    Object.defineProperties(statics, {
        parsers: { enumerable: true,
            value: Object.create({}, {
                ".json": { enumerable: true,
                    value: JsonParser
                }
              , ".kvp": { enumerable: true,
                    value: KvpParser
                }
              , ".yaml": { enumerable: true,
                    value: YamlParser
                }
              , ".yml": { enumerable: true,
                    value: YamlParser
                }
            })
        }
    })

    return {
        constructor: function(socket_path){
            ios.set(this, new Map)
            ios.get(this).set("socket", new UnixSocket(socket_path))

            this.socket.addEventListener("open", e => {
                console.log("[ippanFSDB] socket opened")
            })

            this.socket.addEventListener("message", ({data}) => {
                const { op, binary, tree } = JSON.parse(data)

                if ( op === "read" )
                  nextTick(() => this.read(tree, { binary }))
                else
                  console.log("=> message", data)
            })
        }
      , read: { enumerable: true,
            value: function(tree, opts){
                let processing = Promise.resolve({})

                tree.forEach(([dbpath, filepath]) => {
                    processing = processing.then(dataset => {
                          return new Promise(resolve => {
                              const ext = extname(filepath)
                              const Parser = module.exports.IO.parsers[ext]
                              const parser = new Parser({dbpath, filepath})

                              const onreadystatechange = ({readystate}) => {
                                  if ( readystate < Parser.DONE )
                                    return

                                  parser.removeEventListener("readystatechange", onreadystatechange)
                              }

                              const onend = ({data:dataset}) => {
                                  resolve(dataset)
                              }

                              parser.addEventListener("readystatechange", onreadystatechange)
                              parser.addEventListener("end", onend)
                              parser.parse(dataset)
                          })
                    })
                })

                processing = processing.then(dataset => {
                    this.socket.send(JSON.stringify({ op: "read", data: dataset}))
                })

                processing.catch(e => console.error(e))

                return processing
            }
        }
      , socket: { enumerable: true,
            get: function(){ return ios.get(this).get("socket") }
        }
    }
})
