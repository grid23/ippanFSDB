"use strict"

process.setMaxListeners(1000)
process.addListener("SIGINT", () => process.exit() )
process.addListener("SIGTERM", () => process.exit() )

const {DB} = require("./lib/db/DB")
//const db = new DB({ root: "/tudor/app/public" })
const db = new DB({ root: "./sample" })

db.addEventListener("readystatechange", ({readystate}) => {
    console.log("db readystate change =>", readystate)
})

db.getFruits((err, fruits) => {
    console.log("fruits.length", fruits.length)
})

//db.query("/watches/all", (err, node) => {
db.query("/a/b", (err, node) => {
    if ( err ) throw (err)

    node.read({ lang: "en" })
}).catch(e => console.error(e))
