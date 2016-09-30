"use strict"

const {class:klass} = require("ippankiban/lib/class")

const { DBQIOverHTTP } = require("./DBQIOverHTTP")
const { DBQIOverSocket } = require("./DBQIOverSocket")

module.exports.DBQI = klass(statics => {
    Object.defineProperties(statics, {
        overSocket: { enumerable: true,
            value: (root, dict) => new DBQIOverSocket(root, dict)
        }
      , overHTTP: { enumerable: true,
            value: (root, dict) => new DBQIOverHTTP(root, dict)
        }
    })

    return {
        constructor: function(){
            throw new Error("new DBQI is forbidden")
        }
    }
})
