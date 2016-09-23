"use strict"

const klass = require("ippankiban/lib/class").class
const Node = require("ippankiban/lib/Node").Node

module.exports.DBQuery = klass(Node, statics => {
    const queries = new WeakMap

    return {
        constructor: function(){
            Node.call(this)
            queries.set(this, new Map)
        }
    }
})
