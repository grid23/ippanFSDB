"use strict"

const { exec, fork, spawn } = require("child_process")
const { class:klass } = require("ippankiban/lib/class")
const path = require("path")
const {createServer:createNetServer } = require("net")
const { readFile, stat, writeFile } = require("fs")
const { typeOf } = require("ippankiban/lib/type")


const { Node } = require("ippankiban/lib/Node")
const { UID } = require("ippankiban/lib/UID")

module.exports.DB = klass(Node, statics => {
    const dbs = new WeakMap

    const dbqi_path = path.join(__dirname, "./DBQI")
    const d_binaries = require("./d_binaries")
    const d_parsers = require("./d_parsers")
    const forbidden = require("./forbidden")

    let tmp = "/tmp"

    Object.defineProperties(statics, {
        TMP_DIR: { enumerable: true,
            get: () => tmp
          , set: v => tmp = v
        }
    })

    const create_server_script = (target, {port, secure}) => {
        return new Promise((resolve, reject) => {
            reject("TODO")
        })
    }

    const create_socket_script = (target, { binaries, parsers }) => {
        const script = `${tmp}/${UID.uid()}.js`
        const cwd = target

        const body = `
        "use strict"

        const argv = {}
        process.argv.slice(2).forEach(arg => {
            const idx = arg.search("=")

            if ( idx == -1 )
              return

            const key = arg.slice(0, idx).replace("--", "")
            const value = arg.slice(idx+1)

            argv[key] = value
        })

        const { binaries, parsers, root, socket  } = argv
        const { DBQI } = require("${dbqi_path}")
        DBQI.overSocket(root, { binaries:new Set(binaries.split(",")), parsers:new Set(parsers.split(",")) })
        `

        return new Promise((resolve, reject) => {
            writeFile(script, body, { mode: 0O0777 & (~process.umask()) }, err => {
                if ( err )
                  return reject(err)
                resolve({ script, cwd, argv: [`--socket=1`, `--root=${target}`, `--binaries=${[...binaries].join(",")}`, `--parsers=${[...parsers].join(",")}`] })
            })
        })
    }

    return {
        constructor: function(...args){
            const dict = typeOf(args[0]) == "object" ? args.shift()
                       : typeOg(args[0]) == "string" ? { dir: args.shift() }
                       : {}

            Node.call(this)
            dbs.set(this, new Map)

            dbs.get(this).set("ready", Promise.all([

                // check target folder
                new Promise((resolve, reject) => {
                    const { dir } = dict

                    if ( forbidden.has(dir) )
                      return reject( new Error(`${dir} is forbidden`) )

                    const targets = new Set

                    targets.add( path.resolve(path.dirname(module.parent.filename), dir) )
                    targets.add( path.resolve(path.dirname(module.filename), dir) )
                    targets.add( path.resolve("/", dir) )

                    Promise.all([...targets].map(target => {
                        return new Promise((resolve, reject) => {
                            stat(target, (err, stats) => {
                                if ( err )
                                  return reject( err )
                                if ( !stats.isDirectory() )
                                  return reject( new Error(`${target} is not a folder`) )
                                resolve(target)
                            })
                        }).catch(e => {
                            return null
                        })
                    }))
                    .then(targets => targets.filter(v => !!v))
                    .then(targets => {
                        if ( !targets.length  )
                          return reject(new Error(`unable to resolve a valid path for ${dir}`))
                        if ( targets.length > 1 )
                          return reject(new Error(`more than one path is resolvable for ${dir}`))
                        return targets[0]
                    })
                    .then(target => resolve(target))
                })

                // check DB configuration ( validate secure )
              , new Promise((resolve) => {
                    const { secure } = dict
                    if ( !secure )
                      return resolve()

                    if ( secure && (!secure.key || !secure.cert || !secure.ca) )
                      return reject(new Error("missing filepath for secure certificate"))

                    Promise.all(["key", "cert", "ca"].map(file => {
                        readFile(file, (err, data) => {
                            if ( err )
                              return reject(err)
                            resolve()
                        })
                    }))
                    .catch(e => reject(e))
                    .then(() => resolve)
                })
                .then(() => {
                    return new Promise((resolve, reject) => {
                        const conf = {}
                        const { http, socket, port, secure } = dict
                        conf.http = !!http || !!port
                        conf.port = conf.http && port
                        conf.socket = !conf.http
                        conf.secure = !!secure

                        const { binaries, parsers } = dict
                        conf.binaries = binaries && binaries[Symbol.iterator]
                                               ? new Set([...binaries].filter(binary => typeOf(binary) == "string"))
                                               : d_binaries
                        conf.parsers = parsers && parsers[Symbol.iterator]
                                              ? new Set([...parsers].filter(parser => typeOf(parser) == "string"))
                                              : d_parsers

                        resolve(conf)
                    })
                })
            ])
            .catch(e => this.dispatchEvent("error", e))
            .then(([target, { binaries, parsers, port, secure, socket }]) => {
                dbs.get(this).set("target", target)

                if ( socket ) {
                    dbs.get(this).set("query_method", "queryOverSocket")
                    return create_socket_script(target, { binaries, parsers })
                }
                else {
                    dbs.get(this).set("query_method", "queryOverHTTP")
                    dbs.get(this).set("port", port)
                    dbs.get(this).set("secure", secure)
                    return create_server_script(target, { binaries, parsers, port, secure})
                }

            })
            .catch(e => this.dispatchEvent("error", e))
            .then(({argv, cwd, env, script}) => {
                const cp = fork(script, argv, { cwd, env })
                const pid = cp.pid

                dbs.get(this).set("cp", cp)

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
            })
            .catch(e => this.dispatchEvent("error", e)))
        }
      , cache: { enumerable: true,
            get: function(){ return path.join(tmp, this.uuid) }
        }
      , cp: { enumerable: true,
            get: function(){ return dbs.get(this).get("cp") }
        }
      , query: { enumerable: true,
            value: function(...args){
                dbs.get(this).get("ready")
                .then(() => module.exports.DB.prototype[dbs.get(this).get("query_method")].apply(this, args))
            }
        }
      , queryOverHTTP: { enumerable: false,
            value: function(...args){
                dbs.get(this).get("ready")
                .then(() => {

                })
            }
        }
      , queryOverSocket: { enumerable: false,
            value: function(...args){
                dbs.get(this).get("ready")
                .then(() => {
                    return new Promise((resolve, reject) => {
                        const msg = args[0]
                        const socket_path = `${tmp}/${UID.uid()}.sock`

                        const server = createNetServer(socket => {
                            const chunks = []

                            socket.addListener("data", chunk => chunks.push(chunk.toString()))
                            socket.addListener("end", () => {
                                let data

                                try {
                                    data = JSON.parse(chunks.join(""))
                                } catch(e){
                                    //TODO
                                    return reject(e)
                                }

                                socket.addListener("close", () => {
                                    resolve(data)
                                })

                                server.close()
                            })
                        })

                        server.addListener("listening", () => {
                            this.cp.send({
                                data: msg
                              , socket: socket_path
                            })
                        })

                        server.listen(socket_path)
                    })
                    .catch(e => this.dispatchEvent("error", e))
                })
                .catch(e => this.dispatchEvent("error", e))
                .then(data => {
                    console.log("data", data)
                })
            }
        }
      , uuid: { enumerable: true,
            get: function(){
                if ( !dbs.get(this).has("uuid") )
                  dbs.get(this).set("uuid", UID.uid())
                return dbs.get(this).get("uuid")
            }
        }
    }
})
