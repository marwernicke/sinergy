/* eslint-env mocha */

'use strict'

const assert = require('assert')

const {
  startEnviroment,
  stopEnviroment
} = require('./helpers.boot')

const {
  dropDb,
  recordDbTransactions,
  dbGetProfile
} = require('./workers')

const {
  AUTH,
  VALID_DATA
} = require('./helpers.data')

let request, requestCalls

describe('kyc users auth functions', () => {
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
    await dropDb()
    await recordDbTransactions()
  })

  it('Functions are available for users when valid AUTH token is send', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const data = await request(query)
    assert.ok(data)

    // Check calls on workers
    const calls = await requestCalls({ action: 'getCalls' })
    assert.strictEqual(calls[0].worker, 'user.core')
    assert.strictEqual(calls[0].on, 'checkAuthToken')
  })

  it('Functions are not available for users when wrong token is send', async () => {
    const TOKEN = ['WRONG', { ip: '188.25.20.91' }]
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: TOKEN } ]
    }
    try {
      await request(query)
      throw new Error('Token should not be accepted')
    } catch (e) {
      const error = e.toString().endsWith('ERR_CORE_USER_TOKEN_INVALID')
      assert.ok(error)
      // Mongo Db check
      const dbProfile = await dbGetProfile()
      assert.strictEqual(dbProfile.length, 0, 'Query should not reach database')
    }
  })

  it('Functions are not available for users when wrong IP in token is not send', async () => {
    const TOKEN = ['BIX', {}]
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: TOKEN } ]
    }
    try {
      await request(query)
      throw new Error('Ip should be asked')
    } catch (e) {
      const error = e.toString().endsWith('ERR_CORE_USER_IP_IS_NEEDED')
      assert.ok(error)
      // Mongo Db check
      const dbProfile = await dbGetProfile()
      assert.strictEqual(dbProfile.length, 0, 'Query should not reach database')
    }
  })
})
