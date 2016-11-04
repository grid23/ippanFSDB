"use strict"

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
  new IO( argv.get("socket") )
else
  throw new Error("no --socket argv found")
