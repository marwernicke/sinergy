const spawn = require('child_process').spawn
const path = require('path')
const MongodbMemoryServer = require('mongodb-memory-server').default
const { MongoClient } = require('mongodb')
const _ = require('lodash')
const fs = require('fs')

let conf = null
try {
  conf = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/facs/db-mongo.config.json'), 'utf8'))
} catch (err) {}

let rpc = []

let mongoServer
async function startWorkers (logs) {
  mongoServer = new MongodbMemoryServer()
  const mongoUri = await mongoServer.getConnectionString()
  const kycWorker = spawn('node',
    [
      path.join(__dirname, '../', 'worker.js'),
      '--env=development',
      '--wtype=wrk-core-kyc-api',
      '--NODE_APP_INSTANCE=test',
      `--mongo=${mongoUri}`,
      '--test=true',
      '--apiPort=1338'
    ]
  )
  if (logs) {
    kycWorker.stdout.on('data', (d) => {
      console.log(d.toString())
    })
    kycWorker.stderr.on('data', (d) => {
      console.log(d.toString())
    })
  }
  rpc.push(kycWorker)
  const amount = await startHelpers(logs)
  return amount
}

async function startHelpers (logs) {
  const workers = [
    { name: 's3', port: 13371 },
    { name: 'users', port: 1322 },
    { name: 'sendgrid', port: 1310 },
    { name: 'testcalls', port: 1300 }
  ]
  for (let worker in workers) {
    rpc.push(spawn('node',
      [
        path.join(__dirname, './simulate/bfx-ext-mockspy-js', 'worker.js'),
        '--env=development',
        '--wtype=wrk-ext-mockspy-api',
        `--apiPort=${workers[worker].port}`,
        `--mockspy=${workers[worker].name}`
      ]
    ))
  }
  if (logs) {
    const spy = rpc[rpc.length - 1]
    spy.stdout.on('data', (d) => {
      console.log(d.toString())
    })
    spy.stderr.on('data', (d) => {
      console.log(d.toString())
    })
  }
  return rpc.length
}
function closeRpc (resolve, rpc) {
  if (rpc.length) {
    const close = rpc.pop()
    close.kill()
    close.on('close', () => {
      closeRpc(resolve, rpc)
    })
  } else {
    resolve()
  }
}

function stopWorkers () {
  return new Promise((resolve, reject) => {
    try {
      if (mongoServer && mongoServer.stop) mongoServer.stop()
      closeRpc(resolve, rpc)
    } catch (e) {
      reject(e)
    }
  })
}

async function dropDb () {
  const mongoUri = await mongoServer.getConnectionString()
  const cli = await MongoClient.connect(mongoUri)
  const db = await cli.db(conf.m0.database)
  const drop = await db.dropDatabase()
  return drop
}

async function recordDbTransactions () {
  const mongoUri = await mongoServer.getConnectionString()
  const cli = await MongoClient.connect(mongoUri)
  const db = await cli.db(conf.m0.database)
  const record = await db.setProfilingLevel('all')
  return record
}

async function dbGetProfile (limit = 50) {
  const mongoUri = await mongoServer.getConnectionString()
  const cli = await MongoClient.connect(mongoUri)
  const mc = await cli.db(conf.m0.database)
  return new Promise((resolve, reject) => {
    mc.collection('system.profile').find().limit(limit)
      .toArray((err, res) => {
        if (err) return reject(err)
        resolve(filterProfile(res))
      })
  })
}

async function dbAddQuery (collection, query, update) {
  const mongoUri = await mongoServer.getConnectionString()
  const cli = await MongoClient.connect(mongoUri)
  const mc = await cli.db(conf.m0.database)
  return new Promise((resolve, reject) => {
    mc.collection(collection).update(
      query, update, { upsert: true }, (err, res) => {
        if (err) return reject(err)
        return resolve()
      })
  })
}
function filterProfile (res) {
  return _.map(res, d => _.pick(d, [
    'op', 'ns', 'nMatched', 'nModified'
  ]))
}

module.exports = {
  stopWorkers,
  startWorkers,
  startHelpers,
  dropDb,
  recordDbTransactions,
  dbGetProfile,
  dbAddQuery
}
