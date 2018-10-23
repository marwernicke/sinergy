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
  UID_OF_AUTH,
  logQuery,
  parseAdminAuth,
  VALID_DATA
} = require('./helpers.data')

// Adm log for restrictions adm tests
const logADM = (name) => {
  return { username: `${name}@bitfinex.com`, password: 'example123' }
}

let request, requestCalls

describe('kyc admins restrictions', () => {
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

  beforeEach(async () => {
    await dropDb()
    await requestCalls({ action: 'clearCalls' })
    await recordDbTransactions()
  })

  it('Listed ADM_USERS accounts can be logged in as admins using email and password', async () => {
    const user = { username: 'adm4@bitfinex.com', password: 'example123' }
    const ip = '127.0.0.0'
    const query = {
      action: 'loginAdmin',
      'args': [ { user, ip } ]
    }
    const data = await request(query)
    assert.ok(data)
    // Mongo Db check
    const dbProfile = await dbGetProfile()
    assert.strictEqual(dbProfile.length, 1, 'Should only execute 1 query in db')
    assert.strictEqual(dbProfile[0].op, 'insert', 'Should insert 1 adm token')
    assert.ok(dbProfile[0].ns.endsWith('adminTokens'), 'Should be inserted in "adminTokens" collection')
  })

  it('Not listed ADM_USERS accounts can not be logged in as admins using email and password', async () => {
    const user = { username: 'adm5@bitfinex.com', password: 'example123' }
    const ip = '127.0.0.0'
    const query = {
      action: 'loginAdmin',
      'args': [ { user, ip } ]
    }
    try {
      await request(query)
      throw new Error('Login should not be accepted')
    } catch (e) {
      const error = e.toString().endsWith('Error: ERR_API_BASE: AUTH_FAC_LOGIN_INCORRECT_USERNAME_PASSWORD')
      assert.ok(error)
      // Mongo Db check
      const dbProfile = await dbGetProfile()
      assert.strictEqual(dbProfile.length, 0, 'Query should not reach database')
    }
  })

  it('LoginAdmin cant be use with password = false, leaving that admin only the option to log via Google Auth', async () => {
    const user = {
      username: 'google@bitfinex.com',
      password: false
    }
    const ip = '127.0.0.0'
    const query = {
      action: 'loginAdmin',
      'args': [ { user, ip } ]
    }

    try {
      await request(query)
      throw new Error('SHOULD_NOT_BE_ALLOWED_TO_LOG')
    } catch (e) {
      const err = e.toString().endsWith('Error: ERR_API_BASE: AUTH_FAC_LOGIN_INCORRECT_USERNAME_PASSWORD')
      assert.ok(err)
    }
  })

  it('Is an admins creates a admin token from one IP and then tries to use it from other it wont work', async () => {
    const user = { username: 'adm4@bitfinex.com', password: 'example123' }
    const ip = '127.0.0.0'
    const query = {
      action: 'loginAdmin',
      'args': [ { user, ip } ]
    }
    const data = await request(query)
    const token = data.token
    const WRONG_AUTH_IP = [token, { ip: '190.20.20.20' }]
    const type = 'submitted'
    const query2 = {
      action: 'findByType',
      'args': [ { auth: WRONG_AUTH_IP, type } ]
    }
    try {
      await request(query2)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('ERR_CORE_USER_TOKEN_INVALID')
      assert.ok(error)
    }
  })

  it('loginAdmin should return admins level', async () => {
    const admL0 = await request(logQuery(logADM('admL0')))
    const admL1 = await request(logQuery(logADM('admL1')))
    const admL2 = await request(logQuery(logADM('admL2')))

    assert.strictEqual(admL0.level, 0)
    assert.strictEqual(admL1.level, 1)
    assert.strictEqual(admL2.level, 2)
  })

  it('findByType dont have restrictions  Admins L0', async () => {
    const admL0 = await request(logQuery(logADM('admL0')))
    const ADM_AUTH_L0 = parseAdminAuth(admL0.token)
    const possible = ['pending', 'incomplete', 'submitted', 'canceled', 'refused', 'verified', 'enhanced']
    for (const obj in possible) {
      const query = {
        action: 'findByType',
        'args': [ { auth: ADM_AUTH_L0, type: possible[obj] } ]
      }
      await request(query)
    }
  })

  it('findByType dont show the monitoring list to Admins L1', async () => {
    const admL1 = await request(logQuery(logADM('admL1')))
    const ADM_AUTH_L1 = parseAdminAuth(admL1.token)
    const possible = ['pending', 'incomplete', 'submitted', 'canceled', 'refused', 'verified']
    const notPossible = ['enhanced']

    for (const obj in possible) {
      const query = {
        action: 'findByType',
        'args': [ { auth: ADM_AUTH_L1, type: possible[obj] } ]
      }
      await request(query)
    }

    for (const obj in notPossible) {
      const query = {
        action: 'findByType',
        'args': [ { auth: ADM_AUTH_L1, type: notPossible[obj] } ]
      }

      try {
        await request(query)
        throw new Error(`ADMIN_L1_USER_SHOULD_NOT_BE_ALLOW_TO_${notPossible[obj]}`)
      } catch (e) {
        const err = e.toString().endsWith('ERR_KYC_RESTRICTED_ACCESS')
        assert.ok(err)
      }
    }
  })

  it('findByType dont show the monitoring list to Admins L1', async () => {
    const admL2 = await request(logQuery(logADM('admL2')))
    const ADM_AUTH_L2 = parseAdminAuth(admL2.token)
    const possible = ['pending']
    const notPossible = ['enhanced', 'incomplete', 'submitted', 'canceled', 'refused', 'verified']

    for (const obj in possible) {
      const query = {
        action: 'findByType',
        'args': [ { auth: ADM_AUTH_L2, type: possible[obj] } ]
      }
      await request(query)
    }

    for (const obj in notPossible) {
      const query = {
        action: 'findByType',
        'args': [ { auth: ADM_AUTH_L2, type: notPossible[obj] } ]
      }

      try {
        await request(query)
        throw new Error(`ADMIN_L2_USER_SHOULD_NOT_BE_ALLOW_TO_${notPossible[obj]}`)
      } catch (e) {
        const err = e.toString().endsWith('ERR_KYC_RESTRICTED_ACCESS')
        assert.ok(err)
      }
    }
  })

  it('fetch shows is_monitored to Admins L0', async () => {
    const admL0 = await request(logQuery(logADM('admL0')))
    const ADM_AUTH_L0 = parseAdminAuth(admL0.token)

    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, status: 'incomplete', is_main_account: true, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, is_monitored: true, auth: ADM_AUTH_L0 } ]
    }

    await request(query2)

    const query3 = {
      action: 'fetch',
      'args': [ { auth: ADM_AUTH_L0, collection: 'compliances', uid: UID_OF_AUTH } ]
    }

    const data = await request(query3)
    assert.ok(data[0].is_monitored)
  })

  it('fetch dont show is_monitored to Admins L1 or greaters', async () => {
    const admL1 = await request(logQuery(logADM('admL1')))
    const ADM_AUTH_L1 = parseAdminAuth(admL1.token)

    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, status: 'incomplete', is_main_account: true, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, is_monitored: true, auth: ADM_AUTH_L1 } ]
    }

    await request(query2)

    const query3 = {
      action: 'fetch',
      'args': [ { auth: ADM_AUTH_L1, collection: 'compliances', uid: UID_OF_AUTH } ]
    }

    const data = await request(query3)
    assert.ok(data[0])
    assert.ifError(data[0].is_monitored)
  })
})
