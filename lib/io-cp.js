"use strict"

const { spawn } = require("child_process")
const { IO } = require("./IO")

process.addListener("SIGINT", () => process.exit() )
process.addListener("SIGTERM", () => process.exit() )

const argv = new Map
process.argv.slice(2).forEach(arg => {
    const idx = arg.search("=")

    if ( idx == -1 )
      return

    const key = arg.slice(0, idx).replace("--", "")
    const value = arg.slice(idx+1)

    argv.set(key, value)
})

if ( argv.has("socket") )
  new IO({ socket: argv.get("socket"), debug: argv.get("debug"), verbose: argv.get("verbose") })
else
  throw new Error("no --socket argv found")

process.addListener("exit", () => {
    if ( argv.get("verbose") )
      console.log(`[ippanFSDB] attempting to delete ${argv.get("socket")}`)
    spawn("rm", ["-rf", argv.get("socket")])
})
