"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { Node } = require("ippankiban/lib/Node")

module.exports.Query = klass(Node, statics => {
    const queries = new WeakMap

    let tmp = "/tmp"

    Object.defineProperties(statics, {
        TMP_DIR: { enumerable: true,
            get: () => tmp
          , set: v => tmp = v //TODO fs.stat tmp folder
        }
    })

    return {
        constructor: function(){
            Node.call(this)
            queries.set(this, new Map)

            process.send("ready")
        }
    }
})
