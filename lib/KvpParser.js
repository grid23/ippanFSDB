"use strict"

const { class:klass } = require("ippankiban/lib/class")
const { typeOf } = require("ippankiban/lib/type")

const { Parser, _parserWM:parsers } = require("./Parser")

module.exports.KvpParser = klass(Parser, statics => {

    return {
        constructor: function(...args){
            Parser.apply(this, args)

            const variables = new Map
            const pairs = new Map

            const online = ({line, data}) =>{
                line = line.trim()

                if ( line[0] == "#" || !line.length )
                  return

                if ( line[0] == "$" ) {
                    const idx = line.indexOf("=")
                    variables.set(line.slice(1, idx).trim(), line.slice(idx+1).trim())
                }
                else {
                    const idx = line.indexOf("=")
                    const key = line.slice(0, idx).trim()
                    let value = line.slice(idx+1).trim()

                    if ( value[0] == "[" && value[value.length-1] == "]")
                      value = value.slice(1, -1)
                                   .split(",")
                                   .map(v => {
                                        v = v.trim()

                                        if ( !v.length )
                                          return null
                                        return v
                                    })

                    pairs.set(key, value)
                }
            }

            const onbody = ({ body, data }) => {
                const treepath = [data, ...this.dbpath.split("/").filter(v => !!v)]
                const target = treepath.reduce((target, v) => target[v] = target[v] || {})

                pairs.forEach((value, key) => {
                    if ( !!variables.size )
                      variables.forEach((replace, match) => {
                          if ( typeOf(value) == "string" )
                            target[key] = value.replace(new RegExp(`\\$${match}`, "g"), replace)
                          else if ( typeOf(value) == "array" ) {
                              const to = value.map(v => !!v ? v.replace(new RegExp(`\\$${match}`, "g"), replace) : v)

                              if ( typeOf(target[key]) != "array" )
                                target[key] = to
                              else {
                                  const from = target[key]
                                  target[key] = new Array(Math.max(from.length, to.length))
                                  const l = target[key].length

                                  for ( let i = 0; i < l; i += 1 )
                                    target[key][i] = to.hasOwnProperty(i) && to[i] !== null ? to[i] : from[i]
                              }
                          }
                      })
                    else
                      if ( typeof(value) == "string" )
                        target[key] = value
                      else if ( typeOf(value) == "array" ) {
                          const to = value

                          if ( typeOf(target[key]) != "array" )
                            target[key] = to
                          else {
                              const from = target[key]
                              target[key] = new Array(Math.max(from.length, to.length))
                              const l = target[key].length

                              for ( let i = 0; i < l; i += 1 )
                                  target[key][i] = to.hasOwnProperty(i) && to[i] !== null ? to[i] : from[i]

                          }
                      }
                })

                variables.clear()
                pairs.clear()
            }

            const onreadystatechange = ({readystate}) => {
                if ( readystate != Parser.DONE )
                  return

                this.removeEventListener("line", online)
                this.removeEventListener("body", onbody)
                this.removeEventListener("readystatechange", onreadystatechange)
            }

            this.addEventListener("line", online)
            this.addEventListener("body", onbody)
            this.addEventListener("readystatechange", onreadystatechange)
        }
    }
})
