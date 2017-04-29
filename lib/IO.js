"use strict"

const { USOCK_BUFFER_SIZE } = require("ippanserver/lib/max_usock_buffer")

const { class:klass } = require("ippankiban/lib/class")
const { extname } = require("path")
const { nextTick } = process
const { folder } = require("ippanserver/lib/folder")
const { createWriteStream } = require("fs")
const { resolve:resolvePath } = require("path")
const { UID:{ uid } } = require("ippankiban/lib/UID")

const { EventTarget } = require("ippankiban/lib/EventTarget")
const { UnixSocket } = require("ippanserver/lib/UnixSocket")

const { JsonParser } = require("./JsonParser")
const { KvpParser } = require("./KvpParser")
const { YamlParser } = require("./YamlParser")

module.exports.IO = klass(EventTarget, statics => {
    const ios = new WeakMap
    const tmp_path = resolvePath("/tmp", "./.ippanfsdb")

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
        constructor: function({ socket:socket_path, debug, verbose } = {}){
            ios.set(this, new Map)
            ios.get(this).set("debug", debug)
            ios.get(this).set("verbose", verbose)
            ios.get(this).set("socket", new UnixSocket(socket_path))

            this.socket.addEventListener("open", e => {
                if ( this.verbose )
                  console.log(`[${__filename}] socket opened`)
            })

            this.socket.addEventListener("message", ({data}) => {
                const { op, binary, tree } = JSON.parse(data)

                if ( op === "read" )
                  nextTick(() => this.read(tree, { binary }))
                else if ( this.debug )
                  console.log(`[${__filename}] <= untreated message`, data)
            })
        }
      , debug: { enumerable: true,
            get: function(){ return ios.get(this).get("debug") }
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

                processing = processing.then(dataset => new Promise((resolve, reject) => {
                    //TODO put socket back
                    //this.socket.send(JSON.stringify({ op: "read", data: dataset}))
                    // using built-in messaging provokes the same buffer issue
                    //process.send(JSON.stringify({ op: "read", data: dataset}))

                    const buffer = Buffer.from(JSON.stringify({ op: "read", data: dataset}))
                    if ( buffer.length > USOCK_BUFFER_SIZE ) {
                        folder(tmp_path, "/")
                          .then(path => {
                              const file = resolvePath(path, `./${uid()}`)
                              const stream = createWriteStream(file)

                              const onerror = e => {
                                  stream.removeListener("finish", onfinish)
                                  stream.removeListener("error", onerror)
                                  reject(e)
                                  this.socket.send(JSON.stringify({error:e.message, query, opts, data:null}))
                              }
                              const onfinish = e => {
                                  stream.removeListener("finish", onfinish)
                                  stream.removeListener("error", onerror)
                                  this.socket.send(JSON.stringify({ op: "read", file, dataset:null}))
                                  resolve()
                              }

                              stream.addListener("finish", onfinish)
                              stream.addListener("error", onerror)
                              stream.end(buffer)
                          })
                    }
                    else {
                        this.socket.send(JSON.stringify({ op: "read", data: dataset}))
                        resolve()
                    }

                }))

                processing.catch(e => {
                    console.error(e)
                    nextTick(() => process.exit(1))
                })

                processing.then(() => nextTick(() => process.exit(0)))

                return processing
            }
        }
      , socket: { enumerable: true,
            get: function(){ return ios.get(this).get("socket") }
        }
      , verbose: { enumerable: true,
            get: function(){ return ios.get(this).get("verbose") }
        }
    }
})
