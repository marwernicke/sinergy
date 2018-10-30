'use strict'

const BFX = require('bitfinex-api-node')
const keys = require('./config/config.js')
const _ = require('lodash')

const connections = require('./connections')
// ////////// CONECCION A BITFINEX ///////// //
const apiKey = keys.apiKey
const apiSecret = keys.apiSecret

const bfx = new BFX({
  apiKey,
  apiSecret
})

const rest2 = bfx.rest(2, {
  // options
  transform: true
})
//  //////////////////////FUNCION DATE///////////////////////////////// //

function date (day, month, year, hours, minutes, seconds) {
  if (!hours) {
    hours = 0
  }
  if (!minutes) {
    minutes = 0
  }
  if (!seconds) {
    seconds = 0
  }
  const d = new Date(year, month - 1, day, hours, minutes, seconds)
  return (d.getTime())
}

// //////////////FETCHER//////////////
async function fetchTrades (pair, dateStart, dateEnd) {
  const req = await rest2.trades(pair, dateStart, dateEnd, 1000)
  const ej = _.transform(req, (acum, value, key) => {
    const r = {
      pair: pair,
      TradeId: value.id,
      price: value.price,
      amount: value.amount,
      date: new Date(value.mts) }
    if (value.amount > 10000) {
      acum.push(r)
    }
    return acum
  }, [])
  console.log('datos buscados1')
  return ej
}
//  ///////////////////// LEER ////////////////////////////////// //
async function leerDb (readStart, readEnd) {
  const DB = await connections.connect()
  const allTrades = await _find(DB, 'trades')
  const dateTrades = allTrades.filter(trade => Date.parse(trade.t) > readStart && Date.parse(trade.t) < readEnd)
  await connections.disconnect()
  return dateTrades
}

function _find (db, collection) {
  return new Promise((resolve, reject) => {
    db.collection(collection).find({}).toArray((err, res) => {
      if (err) return reject(err)
      resolve(res)
    })
  })
}
// //////////// CLEAR ///////////////
async function clearDb (collection) {
  const DB = await connections.connect()
  DB.collection(collection).drop(async (err, result) => {
    if (err) throw err
    console.log(`collection ${collection} has beeing errased`)
    await connections.disconnect()
  })
}
// //////////// FILL ///////////////
async function fillDb (datos) {
  const DB = await connections.connect()
  DB.collection('trades').insertMany(datos, async (err, result) => {
    if (err) throw err
    console.log('datos cargados 1')
    await connections.disconnect()
  })
}

module.exports = {
  fillDb,
  leerDb,
  fetchTrades,
  date
}

/* async function marcos () {
  const trades = await fetchTrades('tXRPUSD', fetchStart, fetchEnd)
  console.log('trades:', trades)
}

marcos()
*/
function errase (decision) {
  if (decision) { clearDb('trades') }
}
errase(false)
