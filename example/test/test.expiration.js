/* eslint-env mocha */

'use strict'

const assert = require('assert')

const {
  dropDb,
  recordDbTransactions,
  dbGetProfile,
  getWorker
} = require('./workers')

const {
  startEnviroment,
  stopEnviroment
} = require('./helpers.boot')

const {
  AUTH,
  logADM,
  logQuery,
  parseAdminAuth,
  VALID_DATA
} = require('./helpers.data')

const DB = require('./helpers.dbProfile')

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

let request, requestCalls, ADM_AUTH

describe('kyc saveData related functions', () => {
  before(async function () {
    this.timeout(15000)
    const enviroment = await startEnviroment()
    request = enviroment.request
    requestCalls = enviroment.requestCalls
  })

  after(function (done) {
    this.timeout(20000)
    stopEnviroment(done)
  })

  afterEach(async () => {
    await dropDb()
    await requestCalls({ action: 'clearCalls' })
  })

  beforeEach(async () => {
    const adm1 = await request(logQuery(logADM(1)))
    ADM_AUTH = parseAdminAuth(adm1.token)
    await recordDbTransactions()
  })

  // Cuando sea test que corra cada un segundo
  /*
  */

  it.only('Function saveData should save the data sent and return the data ID', async () => {
    const f = (worker) => {
      return JSON.stringify(worker.ctx.scheduler_sc.mem)
    }
    const fnc = JSON.stringify(f)
    const query = {
      action: 'testWorker',
      'args': [{ fnc }]
    }
    const data = await request(query)
    console.log('data', data)
  }).timeout(60000)
})
