/* eslint-env mocha */

'use strict'

const assert = require('assert')

const {
  dropDb,
  recordDbTransactions,
  dbAddQuery
} = require('./workers')

const {
  populateDatabaseForTests,
  populateDatabaseForNoiseTests
} = require('./helpers.analytics')

const {
  AUTH,
  UID_OF_AUTH,
  logADM,
  logQuery,
  parseAdminAuth,
  VALID_DATA,
  completeData
} = require('./helpers.data')

const {
  startEnviroment,
  stopEnviroment
} = require('./helpers.boot')

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

let request, requestCalls, ADM_AUTH

describe('kyc test logs', () => {
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
    await requestCalls({ action: 'clearCalls' })
  })

  beforeEach(async () => {
    await dropDb()
    const adm1 = await request(logQuery(logADM(1)))
    ADM_AUTH = parseAdminAuth(adm1.token)
    await recordDbTransactions()
  })

  it('statusLogs fetches the table that saves each change of status of a user, returning timestamp, actor and status', async () => {
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const complete = completeData()
    const query = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }

    await request(query)

    const options = {}

    const query3 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options } ]
    }
    const status = await request(query3)

    assert.ok(status[1].timestamp)
    assert.strictEqual(status[1].actor, 'user')
    assert.strictEqual(status[1].status, 'submitted')
  })

  it('If actor was admin returns the user/email of the admin', async () => {
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const complete = completeData()
    const query = {
      action: 'saveData',
      'args': [ { auth: ADM_AUTH, ...complete, _id } ]
    }

    await request(query)

    const options = {}

    const query3 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options } ]
    }
    const status = await request(query3)

    assert.ok(status[1].timestamp)
    assert.strictEqual(status[1].actor, 'adm1@bitfinex.com')
    assert.strictEqual(status[1].status, 'submitted')
  })

  it('All possible status logs (incomplete (automaticaly), canceled, reset, submited, pending and verified)', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const query = {
      action: 'saveData',
      args: [ { _id, ...VALID_DATA, reset: true, auth: AUTH } ]
    }

    await request(query)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }

    await request(query2)

    const query3 = {
      action: 'saveData',
      args: [ { _id, status: 'canceled', auth: AUTH } ]
    }

    await request(query3)

    const query4 = {
      action: 'saveData',
      args: [ { _id, status: 'resumed', auth: AUTH } ]
    }

    await request(query4)

    const query5 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }

    await request(query5)

    const query6 = {
      action: 'process',
      'args': [ { _id, status: 'refused', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(query6)

    const query7 = {
      action: 'process',
      'args': [ { _id, status: 'unrefused', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(query7)

    const query8 = {
      action: 'saveData',
      'args': [ { _id, status: 'pending', notes: 'A note', auth: ADM_AUTH } ]
    }
    await request(query8)

    const query9 = {
      action: 'saveData',
      'args': [ {
        _id,
        kyc_section_status: 2,
        contact_section_status: 2,
        address_section_status: 2,
        identity_section_status: 2,
        financial_section_status: 2,
        auth: ADM_AUTH } ]
    }
    await request(query9)

    const options = {}

    const query10 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options } ]
    }
    const status = await request(query10)

    assert.strictEqual(status[0].status, 'incomplete')
    assert.strictEqual(status[0].actor, 'user')
    assert.strictEqual(status[1].status, 'reset')
    assert.strictEqual(status[1].actor, 'user')
    assert.strictEqual(status[2].status, 'incomplete')
    assert.strictEqual(status[2].actor, 'user')
    assert.strictEqual(status[3].status, 'submitted')
    assert.strictEqual(status[3].actor, 'user')
    assert.strictEqual(status[4].status, 'canceled')
    assert.strictEqual(status[4].actor, 'user')
    assert.strictEqual(status[5].status, 'incomplete')
    assert.strictEqual(status[5].actor, 'user')
    assert.strictEqual(status[6].status, 'submitted')
    assert.strictEqual(status[6].actor, 'user')
    assert.strictEqual(status[7].status, 'refused')
    assert.strictEqual(status[7].actor, 'adm1@bitfinex.com')
    assert.strictEqual(status[8].status, 'unrefused')
    assert.strictEqual(status[8].actor, 'adm1@bitfinex.com')
    assert.strictEqual(status[9].status, 'pending')
    assert.strictEqual(status[9].actor, 'adm1@bitfinex.com')
    assert.strictEqual(status[10].status, 'verified')
    assert.strictEqual(status[10].actor, 'adm1@bitfinex.com')
  })

  it('from incomplete data cant be set to: cancelled, pending, resumed, verified, refused, unrefused', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)
    const options = ['canceled', 'pending', 'resumed', 'verified']
    for (const o in options) {
      try {
        const query = {
          action: 'saveData',
          args: [ { _id, status: options[o], notes: 'a note', auth: ADM_AUTH } ]
        }
        await request(query)
        assert.ok(false, `SHOULD_NOT_REACH_THIS_POINT_WITH_OPT_${options[o]}`)
      } catch (e) {
        assert.ok(e)
      }
    }

    const process = ['refused', 'unrefused', 'canceled']
    for (const o in process) {
      try {
        const query = {
          action: 'process',
          'args': [ { _id, status: process[o], notes: 'a note', auth: ADM_AUTH } ]
        }
        await request(query)
        assert.ok(false, `SHOULD_NOT_REACH_THIS_POINT_WITH_OPT_${options[o]}`)
      } catch (e) {
        assert.ok(e)
      }
    }
  })

  it('from submitted data cant be set to: incomplete, resumed, unrefused', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const complete = completeData()
    const queryC = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }

    await request(queryC)

    const options = ['incomplete', 'resumed']
    for (const o in options) {
      try {
        const query = {
          action: 'saveData',
          args: [ { _id, status: options[o], notes: 'a note', auth: ADM_AUTH } ]
        }
        await request(query)
        assert.ok(false, `SHOULD_NOT_REACH_THIS_POINT_WITH_OPT_${options[o]}`)
      } catch (e) {
        assert.ok(e)
      }
    }

    const process = ['unrefused']
    for (const o in process) {
      try {
        const query = {
          action: 'process',
          'args': [ { _id, status: process[o], notes: 'a note', auth: ADM_AUTH } ]
        }
        await request(query)
        assert.ok(false, `SHOULD_NOT_REACH_THIS_POINT_WITH_OPT_${options[o]}`)
      } catch (e) {
        assert.ok(e)
      }
    }
  })

  it('from refused data cant be set to: incomplete, cancelled, verified, pending, resumed', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const complete = completeData()
    const queryC = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }

    await request(queryC)

    const queryR = {
      action: 'process',
      'args': [ { _id, status: 'refused', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(queryR)

    const options = ['incomplete', 'canceled', 'pending', 'resumed', 'verified']
    for (const o in options) {
      try {
        const query = {
          action: 'saveData',
          args: [ { _id, status: options[o], notes: 'a note', auth: ADM_AUTH } ]
        }
        await request(query)
        assert.ok(false, `SHOULD_NOT_REACH_THIS_POINT_WITH_OPT_${options[o]}`)
      } catch (e) {
        assert.ok(e)
      }
    }

    const process = ['refused', 'canceled']
    for (const o in process) {
      try {
        const query = {
          action: 'process',
          'args': [ { _id, status: process[o], notes: 'a note', auth: ADM_AUTH } ]
        }
        await request(query)
        assert.ok(false, `SHOULD_NOT_REACH_THIS_POINT_WITH_OPT_${options[o]}`)
      } catch (e) {
        assert.ok(e)
      }
    }
  })

  it('from pending data cant be set to: submitted, incomplete, resumed, unrefused', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const complete = completeData()
    const queryC = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }

    await request(queryC)

    const queryP = {
      action: 'saveData',
      'args': [ { _id, status: 'pending', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(queryP)

    const options = ['incomplete', 'submitted', 'resumed', 'verified']
    for (const o in options) {
      try {
        const query = {
          action: 'saveData',
          args: [ { _id, status: options[o], notes: 'a note', auth: ADM_AUTH } ]
        }
        await request(query)
        assert.ok(false, `SHOULD_NOT_REACH_THIS_POINT_WITH_OPT_${options[o]}`)
      } catch (e) {
        assert.ok(e)
      }
    }

    const process = ['unrefused']
    for (const o in process) {
      try {
        const query = {
          action: 'process',
          'args': [ { _id, status: process[o], notes: 'a note', auth: ADM_AUTH } ]
        }
        await request(query)
        assert.ok(false, `SHOULD_NOT_REACH_THIS_POINT_WITH_OPT_${options[o]}`)
      } catch (e) {
        assert.ok(e)
      }
    }
  })

  it('from cancelled data cant be set to: submitted, pending, refused, unrefused, verified.', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const complete = completeData()
    const queryC = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }

    await request(queryC)

    const queryCa = {
      action: 'saveData',
      'args': [ { _id, status: 'canceled', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(queryCa)

    const options = ['submitted', 'pending', 'resumed', 'verified']
    for (const o in options) {
      try {
        const query = {
          action: 'saveData',
          args: [ { _id, status: options[o], notes: 'a note', auth: ADM_AUTH } ]
        }
        await request(query)
        assert.ok(false, `SHOULD_NOT_REACH_THIS_POINT_WITH_OPT_${options[o]}`)
      } catch (e) {
        assert.ok(e)
      }
    }

    const process = ['refused', 'unrefused']
    for (const o in process) {
      try {
        const query = {
          action: 'process',
          'args': [ { _id, status: process[o], notes: 'a note', auth: ADM_AUTH } ]
        }
        await request(query)
        assert.ok(false, `SHOULD_NOT_REACH_THIS_POINT_WITH_OPT_${options[o]}`)
      } catch (e) {
        assert.ok(e)
      }
    }
  })

  it('from verified data status cant be change', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const complete = completeData()
    const queryC = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }

    await request(queryC)

    const queryV = {
      action: 'saveData',
      'args': [ {
        _id,
        kyc_section_status: 2,
        contact_section_status: 2,
        address_section_status: 2,
        identity_section_status: 2,
        financial_section_status: 2,
        auth: ADM_AUTH } ]
    }
    await request(queryV)

    const options = ['incomplete', 'submitted', 'pending', 'canceled', 'resumed', 'verified']
    for (const o in options) {
      try {
        const query = {
          action: 'saveData',
          args: [ { _id, status: options[o], notes: 'a note', auth: ADM_AUTH } ]
        }
        await request(query)
        assert.ok(false, `SHOULD_NOT_REACH_THIS_POINT_WITH_OPT_${options[o]}`)
      } catch (e) {
        assert.ok(e)
      }
    }

    const process = ['refused', 'unrefused', 'canceled']
    for (const o in process) {
      try {
        const query = {
          action: 'process',
          'args': [ { _id, status: process[o], notes: 'a note', auth: ADM_AUTH } ]
        }
        await request(query)
        assert.ok(false, `SHOULD_NOT_REACH_THIS_POINT_WITH_OPT_${options[o]}`)
      } catch (e) {
        assert.ok(e)
      }
    }
  })

  it('Notes can be added to the statusLogs and are not added to data', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', notes: 'A note', auth: AUTH } ]
    }

    await request(initialQuery)

    const options = {}

    const query2 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options } ]
    }
    const status = await request(query2)
    assert.strictEqual(status[0].status, 'incomplete')
    assert.strictEqual(status[0].actor, 'user')
    assert.strictEqual(status[0].notes, 'A note')
    const query3 = {
      action: 'fetch',
      'args': [ { auth: ADM_AUTH, collection: 'compliances', uid: UID_OF_AUTH } ]
    }

    const data = await request(query3)

    assert.ifError(data[0].notes, 'notes should not be added to data')
  })

  it('Notes are required if data is set to pending ', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }

    await request(query2)

    const query3 = {
      action: 'saveData',
      'args': [ { _id, status: 'pending', auth: ADM_AUTH } ]
    }

    try {
      await request(query3)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_EDIT_STATUS_MUST_HAVE_NOTES')
      assert.ok(error)
    }

    const query4 = {
      action: 'fetch',
      'args': [ { auth: ADM_AUTH, collection: 'compliances', uid: UID_OF_AUTH } ]
    }

    const data = await request(query4)
    assert.strictEqual(data[0].status, 'submitted')
  })

  it('statusLogs admits filtering by UID', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    await request(initialQuery)

    const options = {
      uid: UID_OF_AUTH
    }

    const query3 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options } ]
    }
    const status = await request(query3)

    assert.ok(status[0].timestamp)
    assert.strictEqual(status[0].actor, 'user')
    assert.strictEqual(status[0].status, 'incomplete')

    const params2 = {
      uid: 100000
    }

    const query4 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params2 } ]
    }
    const status2 = await request(query4)
    assert.strictEqual(status2.length, 0)
  })

  it('statusLogs admits filtering by status', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    await request(initialQuery)

    const params = {
      status: 'incomplete'
    }

    const query3 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params } ]
    }
    const status = await request(query3)

    assert.ok(status[0].timestamp)
    assert.strictEqual(status[0].actor, 'user')
    assert.strictEqual(status[0].status, 'incomplete')

    const params2 = {
      status: 'submitted'
    }

    const query4 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params2 } ]
    }
    const status2 = await request(query4)
    assert.strictEqual(status2.length, 0)
  })

  it('statusLogs admits pagination', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const complete = completeData()
    const query = {
      action: 'saveData',
      'args': [ { auth: ADM_AUTH, ...complete, _id } ]
    }

    await request(query)

    const query3 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH } ]
    }
    const status = await request(query3)
    assert.strictEqual(status.length, 2)

    const params = { amount: 1, offset: 0 }
    const query4 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params } ]
    }

    const status2 = await request(query4)

    assert.strictEqual(status2.length, 1)
    assert.strictEqual(status2[0].actor, 'user')

    const params2 = { amount: 1, offset: 1 }
    const query5 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params2 } ]
    }
    const status3 = await request(query5)

    assert.strictEqual(status3.length, 1)
    assert.strictEqual(status3[0].actor, 'adm1@bitfinex.com')
  })

  it('statusLogs admits filtering by actor', async () => {
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const complete = completeData()
    const query = {
      action: 'saveData',
      'args': [ { auth: ADM_AUTH, ...complete, _id } ]
    }

    await request(query)

    const params = {
      actor: 'adm1@bitfinex.com'
    }

    const query3 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params } ]
    }
    const status = await request(query3)

    assert.strictEqual(status.length, 1)
    assert.ok(status[0].timestamp)
    assert.strictEqual(status[0].actor, 'adm1@bitfinex.com')
    assert.strictEqual(status[0].status, 'submitted')

    const params2 = {
      actor: 'adm2'
    }

    const query4 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params2 } ]
    }
    const status2 = await request(query4)
    assert.strictEqual(status2.length, 0)
  })

  it('statusLogs admits filtering by start date', async () => {
    const start = new Date()
    await sleep(50)
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    await request(initialQuery)

    const params = {
      start
    }

    const query3 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params } ]
    }
    const status = await request(query3)

    assert.ok(status[0].timestamp)
    assert.strictEqual(status[0].actor, 'user')
    assert.strictEqual(status[0].status, 'incomplete')

    const params2 = {
      start: new Date()
    }

    const query4 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params2 } ]
    }
    const status2 = await request(query4)
    assert.strictEqual(status2.length, 0)
  })

  it('statusLogs admits filtering by end date', async () => {
    const start = new Date()
    await sleep(50)
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    await request(initialQuery)
    await sleep(50)

    const end = new Date()
    const params = {
      end
    }

    const query3 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params } ]
    }
    const status = await request(query3)

    assert.ok(status[0].timestamp)
    assert.strictEqual(status[0].actor, 'user')
    assert.strictEqual(status[0].status, 'incomplete')

    const params2 = {
      end: start
    }

    const query4 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params2 } ]
    }
    const status2 = await request(query4)
    assert.strictEqual(status2.length, 0)
  })

  it('statusLogs admits filtering between dates', async () => {
    const before = new Date()
    await sleep(50)
    const start = new Date()
    await sleep(50)
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    await request(initialQuery)
    await sleep(50)

    const end = new Date()
    await sleep(50)
    const after = new Date()
    const params = {
      start,
      end
    }

    const query3 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params } ]
    }
    const status = await request(query3)

    assert.ok(status[0].timestamp)
    assert.strictEqual(status[0].actor, 'user')
    assert.strictEqual(status[0].status, 'incomplete')

    const params2 = {
      start: before,
      end: start
    }

    const query4 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params2 } ]
    }
    const status2 = await request(query4)
    assert.strictEqual(status2.length, 0)
    const params3 = {
      start: end,
      end: after
    }

    const query5 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params3 } ]
    }
    const status3 = await request(query5)
    assert.strictEqual(status3.length, 0)
  })

  it('statusLogs admits grouping by UID, returning only the last status changed to that UID by sending unique', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const complete = completeData()
    const query = {
      action: 'saveData',
      args: [ { _id, ...complete, auth: AUTH } ]
    }

    await request(query)

    const params = {
      unique: true
    }

    const query3 = {
      action: 'statusLogs',
      'args': [ { auth: ADM_AUTH, options: params } ]
    }

    const status = await request(query3)
    assert.strictEqual(status.length, 1)
    assert.strictEqual(status[0].status, 'submitted')
  })

  it('fetchAdmins fetch all admins if being a super admin', async () => {
    const adm = {
      user: 'adm1@bitfinex.com',
      logs: 0,
      last_log: null,
      active: true
    }
    const query = {
      action: 'fetchAdmins',
      args: [ { auth: ADM_AUTH } ]
    }

    const admins = await request(query)

    assert.strictEqual(admins.length, 8, 'admins should be equal to test/config/default')
    assert.deepStrictEqual(admins[0], adm)
  })

  it('fetchAdmins is not available for admins level 1, 2 or higher, neither for users', async () => {
    const logLevelADM = (name) => {
      return { username: `${name}@bitfinex.com`, password: 'example123' }
    }
    const admL1 = await request(logQuery(logLevelADM('admL1')))
    const ADM_AUTH_L1 = parseAdminAuth(admL1.token)
    assert.strictEqual(admL1.level, 1)
    const admL2 = await request(logQuery(logLevelADM('admL2')))
    const ADM_AUTH_L2 = parseAdminAuth(admL2.token)
    assert.strictEqual(admL2.level, 2)

    const restrict = [ADM_AUTH_L1, ADM_AUTH_L2, AUTH]

    for (const auth in restrict) {
      try {
        const query = {
          action: 'fetchAdmins',
          args: [ { auth: restrict[auth] } ]
        }
        await request(query)
        throw new Error('SHOULD_NOT_REACH_THIS_POINT')
      } catch (e) {
        const error = e.toString().endsWith('KYC_MUST_BE_SUPER_ADMIN_TO_FETCH_ADMINS')
        assert.ok(error)
      }
    }
  })

  it('fetchAdmins returns amount of logs done by an admin and it timestamp if correspond', async () => {
    const timestamp = new Date().getTime()

    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, status: 'incomplete', auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const complete = completeData()
    const query = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }

    await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, status: 'pending', notes: 'A note', auth: ADM_AUTH } ]
    }
    await request(query2)

    // ADM_AUTH is 'adm1@bitfinex.com'
    const query3 = {
      action: 'fetchAdmins',
      args: [ { auth: ADM_AUTH } ]
    }

    const admins = await request(query3)

    assert.strictEqual(admins.length, 8, 'admins should not be added by interaction')
    assert.deepStrictEqual(admins[0].user, 'adm1@bitfinex.com')
    assert.deepStrictEqual(admins[0].logs, 1)
    assert.ok(admins[0].last_log > timestamp)
    assert.deepStrictEqual(admins[1].logs, 0)
    assert.deepStrictEqual(admins[1].last_log, null)
  })

  it('fetchAdmins returns if an admin “is active” (considers active if its actually on ADM_USERS config list)', async () => {
    const update = {
      actor: 'fake@admin.com',
      status: 'incomplete',
      uid: '1111',
      notes: 'some notes',
      timestamp: new Date().getTime()
    }

    const check = { _id: 'fake' }

    await dbAddQuery('statusLogs', check, update)
    const query = {
      action: 'fetchAdmins',
      args: [ { auth: ADM_AUTH } ]
    }

    const admins = await request(query)

    assert.strictEqual(admins.length, 9)
    let checked = false
    for (const n in admins) {
      const active = admins[n].user !== 'fake@admin.com'
      if (!active) checked = true
      assert.deepStrictEqual(admins[n].active, active)
    }
    assert.ok(checked, 'fake@admin.com has been checked as not active')
  })
})

describe('kyc test analytics', () => {
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
    await requestCalls({ action: 'clearCalls' })
  })

  beforeEach(async () => {
    await dropDb()
    const adm1 = await request(logQuery(logADM(1)))
    ADM_AUTH = parseAdminAuth(adm1.token)
    await recordDbTransactions()
  })

  it('Analytics function with type = general, returns general stats with: trigger, final status and averages.', async () => {
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const query = {
      action: 'saveData',
      args: [ { _id, ...VALID_DATA, reset: true, auth: AUTH } ]
    }

    await request(query)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }

    await request(query2)

    const query3 = {
      action: 'saveData',
      args: [ { _id, status: 'canceled', auth: AUTH } ]
    }

    await request(query3)

    const query4 = {
      action: 'saveData',
      args: [ { _id, status: 'resumed', auth: AUTH } ]
    }

    await request(query4)

    const query5 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }

    await request(query5)

    await sleep(2000)

    const query6 = {
      action: 'process',
      'args': [ { _id, status: 'refused', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(query6)

    const query7 = {
      action: 'process',
      'args': [ { _id, status: 'unrefused', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(query7)

    const query8 = {
      action: 'saveData',
      'args': [ { _id, status: 'pending', notes: 'A note', auth: ADM_AUTH } ]
    }
    await request(query8)

    const query9 = {
      action: 'saveData',
      'args': [ {
        _id,
        kyc_section_status: 2,
        contact_section_status: 2,
        address_section_status: 2,
        identity_section_status: 2,
        financial_section_status: 2,
        auth: ADM_AUTH } ]
    }
    await request(query9)

    const options = {
      type: 'general'
    }

    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }
    const analytics = await request(analyticsQ)

    const triggerAll = [
      { status: 'canceled', amount: 1 },
      { status: 'submitted', amount: 1 },
      { status: 'refused', amount: 1 },
      { status: 'reset', amount: 1 },
      { status: 'verified', amount: 1 },
      { status: 'unrefused', amount: 1 },
      { status: 'pending', amount: 1 },
      { status: 'incomplete', amount: 1 }
    ]
    assert.deepStrictEqual(triggerAll, analytics.trigger)

    const finalStatus = [ { status: 'verified', amount: 1 } ]
    assert.deepStrictEqual(finalStatus, analytics.finalStatus)

    const averages = [ {
      status: 'verified',
      average: { seconds: 2, usd: 73036 },
      consideredAmount: 1,
      totalAmount: 1
    } ]
    assert.deepStrictEqual(averages, analytics.averages)
  }).timeout(4000)

  it('Analytics function with type = admin, returns admin stats with: trigger and averages.', async () => {
    const adm2 = await request(logQuery(logADM(2)))
    const ADM_AUTH2 = parseAdminAuth(adm2.token)
    const adm3 = await request(logQuery(logADM(3)))
    const ADM_AUTH3 = parseAdminAuth(adm3.token)
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const query = {
      action: 'saveData',
      args: [ { _id, ...VALID_DATA, reset: true, auth: AUTH } ]
    }

    await request(query)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, notes: 'a note', auth: ADM_AUTH2 } ]
    }

    await request(query2)

    const query3 = {
      action: 'saveData',
      args: [ { _id, status: 'canceled', notes: 'a note', auth: ADM_AUTH3 } ]
    }

    await request(query3)

    const query4 = {
      action: 'saveData',
      args: [ { _id, status: 'resumed', notes: 'a note', auth: ADM_AUTH } ]
    }

    await request(query4)

    const query5 = {
      action: 'saveData',
      'args': [ { _id, ...complete, notes: 'a note', auth: ADM_AUTH } ]
    }

    await request(query5)

    await sleep(2000)

    const query6 = {
      action: 'process',
      'args': [ { _id, status: 'refused', notes: 'a note', auth: ADM_AUTH2 } ]
    }
    await request(query6)

    const query7 = {
      action: 'process',
      'args': [ { _id, status: 'unrefused', notes: 'a note', auth: ADM_AUTH3 } ]
    }
    await request(query7)

    const query8 = {
      action: 'saveData',
      'args': [ { _id, status: 'pending', notes: 'A note', auth: ADM_AUTH } ]
    }
    await request(query8)

    const query9 = {
      action: 'saveData',
      'args': [ {
        _id,
        kyc_section_status: 2,
        contact_section_status: 2,
        address_section_status: 2,
        identity_section_status: 2,
        financial_section_status: 2,
        auth: ADM_AUTH } ]
    }
    await request(query9)

    const options = {
      type: 'admin'
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)

    const trigger = [
      {
        actor: 'adm1@bitfinex.com',
        totalTrigger: 4,
        trigger: [{ status: 'submitted', amount: 1 }, { status: 'verified', amount: 1 }, { status: 'incomplete', amount: 1 }, { status: 'pending', amount: 1 }]
      },
      {
        actor: 'adm2@bitfinex.com',
        totalTrigger: 2,
        trigger: [{ status: 'refused', amount: 1 }, { status: 'submitted', amount: 1 }]
      },
      {
        actor: 'adm3@bitfinex.com',
        totalTrigger: 2,
        trigger: [{ status: 'unrefused', amount: 1 }, { status: 'canceled', amount: 1 }]
      }
    ]
    assert.deepStrictEqual(trigger, analytics.trigger)

    const averages = [
      {
        actor: 'adm1@bitfinex.com',
        status: 'verified',
        average: { seconds: 2, usd: 73036 },
        consideredAmount: 1,
        totalAmount: 1
      }
    ]
    assert.deepStrictEqual(averages, analytics.averages)
  }).timeout(4000)

  it('Analytics function with type = stats, returns the stats of the logs trigger on certain timeframe.', async () => {
    const adm2 = await request(logQuery(logADM(2)))
    const ADM_AUTH2 = parseAdminAuth(adm2.token)
    const adm3 = await request(logQuery(logADM(3)))
    const ADM_AUTH3 = parseAdminAuth(adm3.token)
    const initialQuery = {
      action: 'saveData',
      args: [ { ...VALID_DATA, auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const query = {
      action: 'saveData',
      args: [ { _id, ...VALID_DATA, reset: true, auth: AUTH } ]
    }

    await request(query)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, notes: 'a note', auth: ADM_AUTH2 } ]
    }

    await request(query2)

    const query3 = {
      action: 'saveData',
      args: [ { _id, status: 'canceled', notes: 'a note', auth: ADM_AUTH3 } ]
    }

    await request(query3)

    const query4 = {
      action: 'saveData',
      args: [ { _id, status: 'resumed', notes: 'a note', auth: ADM_AUTH } ]
    }

    await request(query4)

    const query5 = {
      action: 'saveData',
      'args': [ { _id, ...complete, notes: 'a note', auth: ADM_AUTH } ]
    }

    await request(query5)

    await sleep(2000)

    const query6 = {
      action: 'process',
      'args': [ { _id, status: 'refused', notes: 'a note', auth: ADM_AUTH2 } ]
    }
    await request(query6)

    const query7 = {
      action: 'process',
      'args': [ { _id, status: 'unrefused', notes: 'a note', auth: ADM_AUTH3 } ]
    }
    await request(query7)

    const query8 = {
      action: 'saveData',
      'args': [ { _id, status: 'pending', notes: 'A note', auth: ADM_AUTH } ]
    }
    await request(query8)

    const query9 = {
      action: 'saveData',
      'args': [ {
        _id,
        kyc_section_status: 2,
        contact_section_status: 2,
        address_section_status: 2,
        identity_section_status: 2,
        financial_section_status: 2,
        auth: ADM_AUTH } ]
    }
    await request(query9)

    const options = {
      type: 'stats',
      timeFrame: 'year'
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)
    const year = new Date().getFullYear().toString()
    const amount = 1

    const trigger = [
      { '_id': { 'status': 'canceled', year }, amount, 'admins': { 'adm3@bitfinex.com': { amount } } },
      { '_id': { 'status': 'reset', year }, amount, 'admins': {} },
      { '_id': { 'status': 'refused', year }, amount, 'admins': { 'adm2@bitfinex.com': { amount } } },
      { '_id': { 'status': 'verified', year }, amount, 'admins': { 'adm1@bitfinex.com': { amount } } },
      { '_id': { 'status': 'pending', year }, amount, 'admins': { 'adm1@bitfinex.com': { amount } } },
      { '_id': { 'status': 'unrefused', year }, amount, 'admins': { 'adm3@bitfinex.com': { amount } } },
      { '_id': { 'status': 'submitted', year }, amount, 'admins': { 'adm1@bitfinex.com': { amount } } },
      { '_id': { 'status': 'incomplete', year }, amount, 'admins': { 'adm1@bitfinex.com': { amount } } }
    ]
    assert.deepStrictEqual(trigger, analytics.trigger)

    const finalStatus = [
      { '_id': { 'status': 'verified', year }, amount, 'admins': { 'adm1@bitfinex.com': { amount } } }
    ]
    assert.deepStrictEqual(finalStatus, analytics.finalStatus)
  }).timeout(4000)

  it('Analytics function with type = general, test correct result with populate DB', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'general'
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)
    const trigger = [
      { 'status': 'incomplete', 'amount': 9 },
      { 'status': 'submitted', 'amount': 9 },
      { 'status': 'verified', 'amount': 9 }
    ]
    assert.deepStrictEqual(trigger, analytics.trigger)

    const averages = [
      { 'status': 'verified', 'average': { 'seconds': 2448000, 'usd': 712 }, 'consideredAmount': 9, 'totalAmount': 9 }
    ]
    assert.deepStrictEqual(averages, analytics.averages)

    const finalStatus = [
      { 'status': 'verified', 'amount': 9 }
    ]
    assert.deepStrictEqual(finalStatus, analytics.finalStatus)
  }).timeout(4000)

  it('Analytics function with type = admin, test correct result with populate DB', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'admin'
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)
    const trigger = [
      { 'actor': 'adm1@bitfinex.com', 'totalTrigger': 8, 'trigger': [ { 'status': 'submitted', 'amount': 4 }, { 'status': 'verified', 'amount': 4 } ] },
      { 'actor': 'adm2@bitfinex.com', 'totalTrigger': 10, 'trigger': [ { 'status': 'verified', 'amount': 5 }, { 'status': 'submitted', 'amount': 5 } ] }
    ]
    assert.deepStrictEqual(trigger, analytics.trigger)

    const averages = [
      { 'actor': 'adm1@bitfinex.com', 'status': 'verified', 'average': { 'seconds': 0, 'usd': 1000 }, 'consideredAmount': 4, 'totalAmount': 4 },
      { 'actor': 'adm2@bitfinex.com', 'status': 'verified', 'average': { 'seconds': 4406400, 'usd': 482 }, 'consideredAmount': 5, 'totalAmount': 5 }
    ]
    assert.deepStrictEqual(averages, analytics.averages)
  }).timeout(4000)

  it('Analytics function with type = stats, test correct result with populate DB', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'stats',
      timeFrame: 'year'
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const date = new Date()
    const year = date.getFullYear().toString()

    const analytics = await request(analyticsQ)
    /* Test trigger object not tested automaticaly */
    const finalStatus = [
      {
        '_id': {
          'status': 'verified', year
        },
        'amount': 9,
        'admins': {
          'adm2@bitfinex.com': {
            'amount': 5
          },
          'adm1@bitfinex.com': {
            'amount': 4
          }
        }
      }
    ]
    assert.deepStrictEqual(finalStatus, analytics.finalStatus)
  }).timeout(4000)

  it('Analytics function has and option as for noise reduction that is set on 0.95', async () => {
    await populateDatabaseForNoiseTests()

    const options = {
      type: 'general'
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)

    const averages = [
      { 'status': 'verified', 'average': { 'seconds': 172800, 'usd': 500 }, 'consideredAmount': 96, 'totalAmount': 100 }
    ]
    assert.deepStrictEqual(averages, analytics.averages)
  }).timeout(4000)

  it('Analytics function can be called with other noise reduction value, ex precision = 0.90', async () => {
    await populateDatabaseForNoiseTests()

    const options = {
      type: 'general',
      precision: 0.98
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)

    const averages = [
      { 'status': 'verified', 'average': { 'seconds': 88333420, 'usd': 102530 }, 'consideredAmount': 98, 'totalAmount': 100 }
    ]
    assert.deepStrictEqual(averages, analytics.averages)
  }).timeout(4000)

  it('Analytics function with type = stats, result can be show on time frame “day”', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'stats',
      timeFrame: 'day'
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)
    const group = [ ...analytics.trigger, ...analytics.finalStatus ]
    group.forEach((obj) => {
      assert.ok(obj._id.day)
    })
  }).timeout(4000)

  it('Analytics function with type = stats, result can be show on time frame “week”', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'stats',
      timeFrame: 'week'
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)
    const group = [ ...analytics.trigger, ...analytics.finalStatus ]
    group.forEach((obj) => {
      assert.ok(obj._id.week)
    })
  }).timeout(4000)

  it('Analytics function with type = stats, result can be show on time frame “month”', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'stats',
      timeFrame: 'month'
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)
    const group = [ ...analytics.trigger, ...analytics.finalStatus ]
    group.forEach((obj) => {
      assert.ok(obj._id.month)
    })
  }).timeout(4000)

  it('Analytics function with type = stats, result can be show on time frame “year”', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'stats',
      timeFrame: 'year'
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)
    const group = [ ...analytics.trigger, ...analytics.finalStatus ]
    group.forEach((obj) => {
      assert.ok(obj._id.year)
    })
  }).timeout(4000)

  it('Analytics, on send start end params result is filtered between dates', async () => {
    await populateDatabaseForTests()
    const end = new Date().getTime()
    const start = end - 4000

    const options = {
      type: 'general',
      start,
      end
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)
    const trigger = [
      { 'status': 'submitted', 'amount': 4 },
      { 'status': 'incomplete', 'amount': 4 },
      { 'status': 'verified', 'amount': 9 }
    ]
    assert.deepStrictEqual(trigger, analytics.trigger)

    const averages = [
      { 'status': 'verified', 'average': { 'seconds': 2448000, 'usd': 712 }, 'consideredAmount': 9, 'totalAmount': 9 }
    ]
    assert.deepStrictEqual(averages, analytics.averages)

    const finalStatus = [
      { 'status': 'verified', 'amount': 9 }
    ]
    assert.deepStrictEqual(finalStatus, analytics.finalStatus)
  }).timeout(4000)

  it('Analytics, on send maxWorth minWorth params result is filtered between worth', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'general',
      minWorth: 200,
      maxWorth: 301
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)
    const trigger = [
      { 'status': 'incomplete', 'amount': 2 },
      { 'status': 'submitted', 'amount': 2 },
      { 'status': 'verified', 'amount': 2 }
    ]
    assert.deepStrictEqual(trigger, analytics.trigger)

    const averages = [
      { 'status': 'verified', 'average': { 'seconds': 3240000, 'usd': 250 }, 'consideredAmount': 2, 'totalAmount': 2 }
    ]
    assert.deepStrictEqual(averages, analytics.averages)

    const finalStatus = [
      { 'status': 'verified', 'amount': 2 }
    ]
    assert.deepStrictEqual(finalStatus, analytics.finalStatus)
  }).timeout(4000)

  it('Analytic on send a unique uid result is filtered as to only check that uid', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'general',
      uid: 6
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)

    const trigger = [
      { 'status': 'incomplete', 'amount': 1 },
      { 'status': 'submitted', 'amount': 1 },
      { 'status': 'verified', 'amount': 1 }
    ]
    assert.deepStrictEqual(trigger, analytics.trigger)

    const averages = [
      { 'status': 'verified', 'average': { 'seconds': 1728000, 'usd': 200 }, 'consideredAmount': 1, 'totalAmount': 1 }
    ]
    assert.deepStrictEqual(averages, analytics.averages)

    const finalStatus = [
      { 'status': 'verified', 'amount': 1 }
    ]
    assert.deepStrictEqual(finalStatus, analytics.finalStatus)
  }).timeout(4000)

  it('Analytic on send an array of uid result is filtered as to only check the uid contained on the array', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'general',
      uid: [5, 6]
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)

    const trigger = [
      { 'status': 'incomplete', 'amount': 2 },
      { 'status': 'submitted', 'amount': 2 },
      { 'status': 'verified', 'amount': 2 }
    ]
    assert.deepStrictEqual(trigger, analytics.trigger)

    const averages = [
      { 'status': 'verified', 'average': { 'seconds': 3240000, 'usd': 250 }, 'consideredAmount': 2, 'totalAmount': 2 }
    ]
    assert.deepStrictEqual(averages, analytics.averages)

    const finalStatus = [
      { 'status': 'verified', 'amount': 2 }
    ]
    assert.deepStrictEqual(finalStatus, analytics.finalStatus)
  }).timeout(4000)

  it('Analytic on send an array of uid result is filtered as to only check the uid contained on the array', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'general',
      status: 'incomplete'
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)
    const trigger = [
      { 'status': 'incomplete', 'amount': 9 }
    ]
    assert.deepStrictEqual(trigger, analytics.trigger)

    const averages = [ ]
    assert.deepStrictEqual(averages, analytics.averages)

    const finalStatus = [ ]
    assert.deepStrictEqual(finalStatus, analytics.finalStatus)
  }).timeout(4000)

  it('Analytic on send an array of uid result is filtered as to only check the uid contained on the array', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'general',
      status: ['incomplete', 'verified']
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)
    const trigger = [
      { 'status': 'verified', 'amount': 9 },
      { 'status': 'incomplete', 'amount': 9 }
    ]
    assert.deepStrictEqual(trigger, analytics.trigger)

    const averages = [
      { 'status': 'verified', 'average': { 'seconds': 2448000, 'usd': 712 }, 'consideredAmount': 9, 'totalAmount': 9 }
    ]
    assert.deepStrictEqual(averages, analytics.averages)

    const finalStatus = [
      { 'status': 'verified', 'amount': 9 }
    ]
    assert.deepStrictEqual(finalStatus, analytics.finalStatus)
  }).timeout(4000)

  it('Analytic on send a unique actor result is filtered as to only check that  actor', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'general',
      actor: 'adm1@bitfinex.com'
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)

    const trigger = [
      { 'status': 'submitted', 'amount': 4 },
      { 'status': 'verified', 'amount': 4 }
    ]
    assert.deepStrictEqual(trigger, analytics.trigger)

    const averages = [
      { 'status': 'verified', 'average': { 'seconds': 0, 'usd': 1000 }, 'consideredAmount': 4, 'totalAmount': 4 }
    ]
    assert.deepStrictEqual(averages, analytics.averages)

    const finalStatus = [
      { 'status': 'verified', 'amount': 4 }
    ]
    assert.deepStrictEqual(finalStatus, analytics.finalStatus)
  }).timeout(4000)

  it('Analytic on send an array of actor result is filtered as to only check the actor contained on the array', async () => {
    await populateDatabaseForTests()

    const options = {
      type: 'general',
      actor: [ 'adm1@bitfinex.com', 'adm2@bitfinex.com' ]
    }
    const analyticsQ = {
      action: 'analytics',
      'args': [ { auth: ADM_AUTH, options } ]
    }

    const analytics = await request(analyticsQ)

    const trigger = [
      { 'status': 'submitted', 'amount': 9 },
      { 'status': 'verified', 'amount': 9 }
    ]
    assert.deepStrictEqual(trigger, analytics.trigger)

    const averages = [
      { 'status': 'verified', 'average': { 'seconds': 2448000, 'usd': 712 }, 'consideredAmount': 9, 'totalAmount': 9 }
    ]
    assert.deepStrictEqual(averages, analytics.averages)

    const finalStatus = [
      { 'status': 'verified', 'amount': 9 }
    ]
    assert.deepStrictEqual(finalStatus, analytics.finalStatus)
  }).timeout(4000)
})
