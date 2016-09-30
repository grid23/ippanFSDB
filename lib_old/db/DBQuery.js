"use strict"

const { exec, fork, spawn } = require("child_process")
const klass = require("ippankiban/lib/class").class
const path = require("path")
const { writeFile } = require("fs")


const Node = require("ippankiban/lib/Node").Node
const { UID } = require("ippankiban/lib/UID")

module.exports.DBQuery = klass(Node, statics => {
    const queries = new WeakMap

    const active = new Set
    const waiting = new Set

    const query_path = "../query/"
    const tmp = process.env.tmp || "/tmp"

    Object.defineProperties(statics, {
        ULIMIT: { enumerable: true,
            value: 100 //TODO find ulimit on local machine
        }
    })

    const create_query_script = ({ binaries, parsers, root, target }) => {
        const script = `${tmp}/${UID.uid()}.js`
        const cwd = path.join(__dirname, query_path)

        const body = `
            "use strict"

            const path = require("path")

            process.setMaxListeners(1000)
            process.addListener("SIGINT", () => process.exit() )
            process.addListener("SIGTERM", () => process.exit() )

            const argv = {}
            process.argv.slice(2).forEach(arg => {
                const idx = arg.search("=")

                if ( idx == -1 )
                  return

                const key = arg.slice(0, idx).replace("--", "")
                const value = arg.slice(idx+1)

                argv[key] = value
            })

            const { root, binaries, parsers, target } = argv
            const { Query } = require(path.join(process.cwd(), "./Query"))

            new Query(root, target, {
                binaries: new Set(binaries.split(","))
              , parsers: new Set(parsers.split(","))
            })
        `

        return new Promise((resolve, reject) => {
            writeFile(script, body, { mode: 0O0777 & (~process.umask()) }, err => {
                if ( err )
                  return reject(err)

                  const argv = [
                      `--binaries=${[...binaries].join(",")}`
                    , `--parsers=${[...parsers].join(",")}`
                    , `--root=${root}`
                    , `--target=${target}`
                  ]

                  resolve({ script, cwd, env: { tmp }, argv })
            })
        })
    }

    return {
        constructor: function({root, binaries, parsers}, {path:target}){
            Node.call(this)
            queries.set(this, new Map)
            queries.get(this).set("uuid", UID.uid())
            queries.get(this).set("ready", Promise.all([

                new Promise(( resolve, reject ) => {
                    create_query_script({ binaries, parsers, root, target })
                    .then(({ script, cwd, env, argv }) => {
                        const cp = fork(script, argv, { cwd, env })
                        const pid = cp.pid

                        queries.get(this).set("cp", cp)

                        cp.addListener("exit", code => {
                            if ( code == 0 )
                              this.dispatchEvent("childprocessexit")
                            else
                              this.dispatchEvent("error", `child exited with code ${code}`)
                        })

                        process.addListener("exit", code => {
                            spawn("rm", ["-rf", script])
                            exec(`kill -9 ${pid}`)
                        })

                        let readytimer = setTimeout(() => {
                            reject(new Error("ready message timeout"))
                        }, 5000)

                        cp.addListener("message", (msg) => {
                            if ( msg !== "ready" )
                              return
                            clearTimeout(readytimer)
                            resolve()
                        })
                    })
                })
            ]).catch(e => this.dispatchEvent("error", e)))

            queries.get(this).get("ready")
              .then(() => {
                  this.dispatchEvent("ready")
              })
        }
      , cp: { enumerable: true,
            get: function(){ return queries.get(this).get("cp") }
        }
      , uuid: { enumerable: true,
            get: function(){ return queries.get(this).get("uuid") }
        }
    }
})
