"use strict"

const DB = require("./lib/DB").DB
const db = new DB({ dir: "./sample" })

db.addEventListener("error", e => {
    console.error(e.error)
})

db.addEventListener("childprocessexit", e => {
    console.log("child exited")
})


db.query("/foo")
