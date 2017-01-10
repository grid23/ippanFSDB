"use strict"

const {class:klass} = require("ippankiban/lib/class")

const {Event, _eventWM} = require("ippankiban/lib/Event")

module.exports.ReadyStateChange = klass(Event, statics => {
    Object.defineProperties(statics, {
        NAME: { enumerable: true, value: "readystatechange" }
    })

    return {
        constructor: function(to, from){
            Event.call(this, module.exports.ReadyStateChange.NAME)
            _eventWM.get(this).readystate = to
            _eventWM.get(this).prevreadystate = from
        }
      , readystate: { enumerable: true,
            get: function(){ return _eventWM.get(this).readystate }
        }
      , prevreadystate: { enumerable: true,
            get: function(){ return _eventWM.get(this).prevreadystate }
        }
    }
})
