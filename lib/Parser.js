"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { createReadStream, stat } = require("fs")
const { createInterface:createReadlineInterface } = require("readline")

const { Event, _eventWM:events } = require("ippankiban/lib/Event")
const { EventTarget } = require("ippankiban/lib/EventTarget")
const { ReadyStateFul } = require("ippankiban/lib/ReadyStateFul")
const { nextTick } = process


const BodyEvt = klass(Event, statics => {

    return {
        constructor: function(body, data){
            Event.call(this, "body")
            events.get(this).set("body", body)
            events.get(this).set("data", data)
        }
      , body: { enumerable: true,
            get: function(){ return events.get(this).get("body") }
        }
      , data: { enumerable: true,
            get: function(){ return events.get(this).get("data") }
        }
    }
})

const EndEvt = klass(Event, statics => {

    return {
        constructor: function(data){
            Event.call(this, "end")
            events.get(this).set("data", data)
        }
      , data: { enumerable: true,
            get: function(){ return events.get(this).get("data") }
        }
    }
})

const LineEvt = klass(Event, statics => {

    return {
        constructor: function(line, data){
            Event.call(this, "line")
            events.get(this).set("line", line)
            events.get(this).set("data", data)
        }
      , data: { enumerable: true,
            get: function(){ return events.get(this).get("data") }
        }
      , line: { enumerable: true,
            get: function(){ return events.get(this).get("line") }
        }
    }
})

module.exports._parserWM = new WeakMap
module.exports.Parser = klass(EventTarget, ReadyStateFul, statics => {
    const parsers = module.exports._parserWM

    Object.defineProperties(statics, {
        UNINITIALIZED: { enumerable: true, value: 0b0 }
      , [0b0]: { enumerable: true, value: "UNINITIALIZED" }
      , INITIALIZING: { enumerable: true, value: 0b1 }
      , [0b10]: { enumerable: true, value: "INITIALIZING" }
      , INITIALIZED: { enumerable: true, value: 0b10 }
      , [0b11]: { enumerable: true, value: "INITIALIZED" }
      , PARSING: { enumerable: true, value: 0b11 }
      , [0b10]: { enumerable: true, value: "PARSING" }
      , DONE: { enumerable: true, value: 0b100 }
      , [0b100]: { enumerable: true, value: "DONE" }
    })

    return {
        constructor: function({dbpath, filepath}){
            parsers.set(this, new Map)
            parsers.get(this).set("filepath", filepath)
            parsers.get(this).set("dbpath", dbpath)

            parsers.get(this).set("ready", Promise.resolve()
            .then(() => new Promise(resolve => {
                nextTick(() => {
                    ReadyStateFul.readystateChange(this, module.exports.Parser.INITIALIZING)
                    resolve()
                })
            }))
            .then(() => new Promise((resolve, reject) => {
                stat(this.filepath, (err, stats) => {
                    if ( err || !stats.isFile() )
                      reject(err || new Error(`file ${this.filepath} cannot be read`))

                    ReadyStateFul.readystateChange(this, module.exports.Parser.INITIALIZED)
                    resolve()
                })
            }))
            .catch(err => this.dispatchEvent("error", err)))
        }
      , dbpath: { enumerable: true,
            get: function(){ return parsers.get(this).get("dbpath") }
        }
      , filepath: { enumerable: true,
            get: function(){ return parsers.get(this).get("filepath") }
        }
      , parse: { enumerable: true,
            value: function(target){
                target = target || {}

                return new Promise((resolve, reject) => {
                    const onready = () => {
                        ReadyStateFul.readystateChange(this, module.exports.Parser.PARSING)

                        const input = createReadStream( this.filepath )
                        const lines = createReadlineInterface({ input })

                        const data = target
                        const chunks = []
                        const online = line => {
                            chunks.push(line)
                            this.dispatchEvent(new LineEvt(line, data))
                        }

                        const onend = () => {
                            input.removeListener("error", onerror)
                            lines.removeListener("error", onerror)
                            lines.removeListener("line", online)
                            lines.removeListener("close", onend)

                            const buffer = `${chunks.join("\n")}`

                            this.dispatchEvent(new BodyEvt(buffer, data))

                            nextTick(() => {
                                parsers.get(this).set("dataset", data)

                                this.dispatchEvent(new EndEvt(data))
                                ReadyStateFul.readystateChange(this, module.exports.Parser.DONE)
                            })
                        }

                        const onerror = e => { reject(e) }

                        input.addListener("error", onerror)
                        lines.addListener("error", onerror)
                        lines.addListener("line", online)
                        lines.addListener("close", onend)
                    }

                    const onreadystatechange = ({readystate}) => {
                        if ( readystate < module.exports.Parser.INITIALIZED )
                          return

                        this.removeEventListener("readystatechange", onreadystatechange)
                        onready()
                    }

                    if ( this.readystate == module.exports.Parser.DONE )
                      return new Promise(resolve => resolve(parsers.get(this).get("dataset")))
                    if ( this.readystate < module.exports.Parser.INITIALIZED )
                      this.addEventListener("readystatechange", onreadystatechange)
                    else onready()
                })
            }
        }
    }
})
