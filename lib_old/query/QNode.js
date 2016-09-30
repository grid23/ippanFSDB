"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { Node } = require("ippankiban/lib/Node")

module.exports.QNode = klass(Node, statics => {
    const nodes = new WeakMap

    return {
        constructor: function(){
            Node.call(this)
            nodes.set(this, new Map)
        }
      , fruits: { enumerable: true,
            get: function(){

            }
        }
      , leaves: { enumerable: true,
            get: function(){

            }
        }
      , path: { enumerable: true,
            get: function(){

            }
        }
      , realpath: { enumerable: true,
            get: function(){

            }
        }
      , read: { enumerable: true,
            value: function(){

            }
        }
      , write: { enumerable: true,
            value: function(){

            }
        }
    }
})
