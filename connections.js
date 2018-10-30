'use strict'
const MongoClient = require('mongodb').MongoClient
const { DB_HOST, DB_PORT, DB_NAME } = require('./db/config')

const testMongoUri = async () => {
  const MongodbMemoryServer = require('mongodb-memory-server').default
  const mongoServer = new MongodbMemoryServer()
  const mongoUri = await mongoServer.getConnectionString()
  return mongoUri
}

const url = (!test)
  ? 'mongodb://' + DB_HOST + ':' + DB_PORT
  : testMongoUri()
// Connection URL

// Tests URL
let instance = null
// Database concection y disconection///
function connect (test) {
  return new Promise((resolve, reject) => {
    MongoClient.connect(url, { useNewUrlParser: true }, function (err, client) {
      if (err) { console.log(err) }

      console.log('Connected successfully to server')
      instance = client
      resolve(client.db(DB_NAME))
    })
  })
}

function disconnect () {
  return new Promise((resolve, reject) => {
    console.log('disconecting...')
    instance.close((err, result) => {
      if (err) { console.log(err) }
      resolve()
    })
  })
}
// Database concection y disconection////////

module.exports = {
  connect,
  disconnect
}

// connect()
// setTimeout(() => { disconnect() }, 2000)
