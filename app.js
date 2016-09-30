"use strict"

process.setMaxListeners(1000)
process.addListener("SIGINT", () => process.exit() )
process.addListener("SIGTERM", () => process.exit() )

const {DB} = require("./lib/db/DB")
const db = new DB({ root: "./sample" })

db.addEventListener("readystatechange", ({readystate}) => {
    console.log("db readystate change =>", readystate)
})
