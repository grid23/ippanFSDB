"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { typeOf } = require("ippankiban/lib/type")
const yaml = require("js-yaml")

const { Parser, _parserWM:parsers } = require("./Parser")

module.exports.YamlParser = klass(Parser, statics => {

    return {
        constructor: function(...args){
            Parser.apply(this, args)

            const onbody = ({body, data}) =>{
                const treepath = [data, ...this.dbpath.split("/").filter(v => !!v)]
                const target = treepath.reduce((target, v) => target[v] = target[v] || {})

                try {
                    body = yaml.load(body)
                } catch(e) {
                    this.dispatchEvent("error", e)
                }

                const depths = [ [[], body] ]
                const pairs = new Map
                const remainder = new Map

                while ( depths.length ) {
                    const [path, o] = depths.shift()
                    Object.keys(o).forEach(key => {
                        if ( typeOf(o[key]) == "object" ) remainder.set(key, o[key])
                        else pairs.set(key, o[key])
                    })

                    remainder.forEach((value, key) => depths.push([ [...path, key], value ]))

                    const atDepth = [target, ...path].reduce((target, v) => target[v])
                    pairs.forEach((value, key) => {
                        if ( typeOf(value) !== "array" || typeOf(atDepth[key]) !== "array" )
                          atDepth[key] = value
                        else {
                            const from = atDepth[key]
                            const to = atDepth[key] = new Array(Math.max(from.length, value.length))
                            const l = to.length

                            for ( let i = 0; i < l; i += 1 )
                              to[i] = value.hasOwnProperty(i) && value[i] !== null ? value[i] : from[i]

                        }
                    })

                    pairs.clear()
                    remainder.clear()
                }
            }

            const onreadystatechange = ({readystate}) => {
                if ( readystate != Parser.DONE )
                  return

                this.removeEventListener("body", onbody)
                this.removeEventListener("readystatechange", onreadystatechange)
            }

            this.addEventListener("body", onbody)
            this.addEventListener("readystatechange", onreadystatechange)
        }
    }
})
