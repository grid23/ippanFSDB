"use strict"

const { class:klass } = require("ippankiban/lib/class")

const { EventTarget } = require("ippankiban/lib/EventTarget")
const { ReadyStateChange } = require("../common/ReadyStateChange")
const { UnixSocket } = require("ippankiban/server/UnixSocket")

module.exports.IO = klass(EventTarget, statics => {
    const ios = new WeakMap

    return {
        constructor: function(socket_path){
            ios.set(this, new Map)
            ios.get(this).set("socket", new UnixSocket(socket_path))

            ios.get(this).get("socket").addEventListener("open", e => {
                console.log("socket opened")
                ios.get(this).get("socket").send("coucou")
            })

            ios.get(this).get("socket").addEventListener("message", e => {
                console.log("=> message", e.data)
            })
        }
    }
})
