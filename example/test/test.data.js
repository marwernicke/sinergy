/* eslint-env mocha */

'use strict'

const assert = require('assert')

const {
  dropDb,
  recordDbTransactions,
  dbGetProfile
} = require('./workers')

const {
  startEnviroment,
  stopEnviroment
} = require('./helpers.boot')

const {
  AUTH,
  UID_OF_AUTH,
  logADM,
  logQuery,
  parseAdminAuth,
  VALID_DATA,
  VALID_DOCUMENTS,
  LIMIT,
  OFFSET,
  completeSection,
  completeData,
  completeMember
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

  it('Function saveData should save the data sent and return the data ID', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const data = await request(query)
    assert.ok(data)
    // Mongo Db check
    const dbProfile = await dbGetProfile()
    assert.strictEqual(dbProfile.length, 3, 'Should do 3 query in db')
    assert.deepStrictEqual(dbProfile[0], { op: 'query', ns: 'kyc.compliances' }, 'Checks there is not another main account created')
    assert.deepStrictEqual(dbProfile[1], { op: 'update',
      ns: 'kyc.compliances',
      nMatched: 0,
      nModified: 0 }, 'Creates the account')
    assert.deepStrictEqual(dbProfile[2], { op: 'update',
      ns: 'kyc.statusLogs',
      nMatched: 0,
      nModified: 0 }, 'Saves the new log on status logs')
  })
  // completeSection
  it('saveData on send all the required fields of the section the status is set to 1 automatically, responding what had changed on server', async () => {
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)
    const obj = { _id, ...completeSection('contact_section_status') }
    const query = {
      action: 'saveData',
      'args': [ { ...obj, auth: AUTH } ]
    }
    const data = await request(query)
    assert.strictEqual(data.contact_section_status, 1)
  })

  it('On save data (corporate members), on send all the required fields of the section the status is set to 1 automatically', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    await request(initialQuery)

    const CORPORATE_MEMBER = { first_name: 'Jhon' }
    const query = {
      action: 'saveData',
      'args': [ { ...CORPORATE_MEMBER, auth: AUTH } ]
    }

    const { _id } = await request(query)
    const obj = { _id, ...completeSection('address_section_status') }
    const query2 = {
      action: 'saveData',
      'args': [ { ...obj, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'fetch',
      'args': [ { auth: ADM_AUTH, collection: 'compliances', uid: UID_OF_AUTH, amount: LIMIT, offset: OFFSET } ]
    }
    const data = await request(query3)
    assert.strictEqual(data[1].address_section_status, 1)
    assert.strictEqual(data[1].first_name, 'Jhon')
  })

  it('On save data (corporate members), Corporate members cant be added if there is not a main account related to them', async () => {
    const CORPORATE_MEMBER = { first_name: 'Jhon' }
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...CORPORATE_MEMBER, auth: AUTH } ]
    }

    try {
      await request(initialQuery)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: KYC_NO_MAIN_ACCOUNT_FOUNDED', e.toString())
    }
  })

  it('On save data there cant be two main accounts related to the same UID', async () => {
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }

    await request(initialQuery)

    try {
      await request(initialQuery)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: NOT_TWO_MAIN_ACCOUNTS_ADMITTED_FOR_THE_SAME_UID', e.toString())
    }
  }).timeout(200000)

  it('saveData users cant send xxx_section_status, only: {kyc_section_status: 1}', async () => {
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const query = {
      action: 'saveData',
      'args': [ { _id, kyc_section_status: 1, auth: AUTH } ]
    }

    await request(query)

    const opts = [
      { contact_section_status: 1 },
      { address_section_status: 1 },
      { corporate_section_status: 1 },
      { identity_section_status: 1 },
      { financial_section_status: 1 }
    ]

    for (const e in opts) {
      try {
        const queryE = {
          action: 'saveData',
          args: [ { _id, ...opts[e], auth: AUTH } ]
        }
        await request(queryE)
        throw new Error('ADMIN_USER_CANT_CREATE_AN_ACCOUNT')
      } catch (e) {
        assert.strictEqual('Error: ERR_API_BASE: KYC_MUST_BE_ADMIN_TO_CHANGE_THIS_DATA', e.toString())
      }
    }
  })

  it('Summary - Function saveData should check and mark as submitted, if submitted add transactions summary -- when admin fetches filters he should get summary back', async () => {
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

    const query3 = {
      action: 'findByType',
      'args': [ { type: 'submitted', amount: LIMIT, offset: OFFSET, auth: ADM_AUTH } ]
    }
    const filterData = await request(query3)
    assert.ok(filterData.filter[filterData.filter.length - 1].summary)
    // Mongo Db check
    const dbProfile = await dbGetProfile()
    DB.createMainAccount(dbProfile)
    // update
    assert.deepStrictEqual(dbProfile[0], { op: 'query', ns: 'kyc.compliances' }, 'Checks old data saved')
    assert.deepStrictEqual(dbProfile[1], { op: 'update', ns: 'kyc.compliances', nMatched: 1, nModified: 1 }, 'Updates data')
    assert.deepStrictEqual(dbProfile[2], { op: 'update',
      ns: 'kyc.statusLogs',
      nMatched: 0,
      nModified: 0 }, 'Updates status as it has been changed')
    // find by type
    assert.deepStrictEqual(dbProfile[3], { op: 'query', ns: 'kyc.adminTokens' }, 'Checks admin token')
    assert.deepStrictEqual(dbProfile[4], { op: 'query', ns: 'kyc.compliances' }, 'searches compliances')
    assert.deepStrictEqual(dbProfile[5], { op: 'query', ns: 'kyc.recentlies' }, 'searches recentlies')
  })

  it('Summary - users should never see their own summary', async () => {
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

    const query3 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }
    const fetchData = await request(query3)
    assert.strictEqual(fetchData[fetchData.length - 1].summary, undefined)
  })

  it('Function fetch should return the data saved for that user', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    assert.ok(_id)
    const query2 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }
    const data = await request(query2)

    const obj = data.filter((obj) => { return obj._id === _id })
    assert.strictEqual(1, obj.length)
    assert.strictEqual(VALID_DATA.fullname, obj[0].fullname)
    assert.strictEqual(VALID_DATA.address, obj[0].address)
    // Mongo Db check
    const dbProfile = await dbGetProfile()
    DB.createMainAccount(dbProfile)
    assert.strictEqual(dbProfile[0].op, 'query', 'Second call must be a query operation')
  })

  it('Fetch cant be use to search on other collections than documents or compliances', async () => {
    const error = ['admTokens', 'adminChecks', 'recentlies', 'statusLogs']
    for (const err in error) {
      const query = {
        action: 'fetch',
        'args': [ { collection: error[err], amount: LIMIT, offset: OFFSET, auth: AUTH } ]
      }
      try {
        await request(query)
        throw new Error(`USER_CANT_FETCH_${error[err]}`)
      } catch (e) {
        assert.strictEqual('Error: ERR_API_BASE: KYC_FIND_ERROR: Error: KYC_ERROR_INVALID_COLLECTION_TO_FETCH', e.toString())
      }
    }
  })

  it('Function saveData, On account creation returns the core user and default status, incomplete', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const data = await request(query)

    assert.strictEqual(data.status, 'incomplete')
    assert.ok(data.core_email)
  })

  it('Function saveData can not change the core data', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, core_username: 'change', core_email: 'change', auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }
    const data = await request(query2)

    const obj = data.filter((obj) => { return obj._id === _id })
    assert.strictEqual(1, obj.length)
    assert.notStrictEqual('change', obj[0].core_username)
    assert.notStrictEqual('change', obj[0].core_email)
  })

  it('Function saveData, when data id is being sent, should overwrite the saved data with the data sent, if being the same user and dont add the core data', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { first_name: 'Change name', nationality: 'USA', _id, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }

    const data = await request(query3)

    const obj = data.filter((obj) => { return obj._id === _id })
    assert.strictEqual(1, obj.length)
    assert.strictEqual('Change name', obj[0].first_name)
    assert.strictEqual('USA', obj[0].nationality)
  })

  it('Function saveData, when data id is being sent as an admin, should overwrite the saved data with the data sent, no matter if it is a different user ', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { first_name: 'Change name', nationality: 'USA', _id, auth: ADM_AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }

    const data = await request(query3)

    const obj = data.filter((obj) => { return obj._id === _id })
    assert.strictEqual(1, obj.length)
    assert.strictEqual('Change name', obj[0].first_name)
    assert.strictEqual('USA', obj[0].nationality)
  })

  it('Function delete, can be used to delete a corporate member account sending the _id by the user', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    await request(initialQuery)

    const CORPORATE_MEMBER = { first_name: 'Jhon' }
    const query = {
      action: 'saveData',
      'args': [ { ...CORPORATE_MEMBER, auth: AUTH } ]
    }

    const { _id } = await request(query)

    const query2 = {
      action: 'delete',
      'args': [ { _id, auth: AUTH, collection: 'compliances' } ]
    }
    await request(query2)

    const query3 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }

    const data = await request(query3)
    const obj = (data) ? data.filter((obj) => { return obj._id === _id }) : []
    assert.strictEqual(0, obj.length)
    // Mongo Db check
    const dbProfile = await dbGetProfile()
    DB.createMainAccount(dbProfile, false, true)
    DB.createMemberAccount(dbProfile)
    DB.deleteOp(dbProfile, 'compliances')
    DB.fetch(dbProfile, 'compliances')
  })

  it('Function delete, can be used to delete a corporate member account sending the _id and uid by an admin', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    await request(initialQuery)

    const CORPORATE_MEMBER = { first_name: 'Jhon' }
    const query = {
      action: 'saveData',
      'args': [ { ...CORPORATE_MEMBER, auth: AUTH } ]
    }

    const { _id } = await request(query)

    const query2 = {
      action: 'delete',
      'args': [ { _id, auth: ADM_AUTH, collection: 'compliances', uid: UID_OF_AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }

    const data = await request(query3)
    const obj = (data) ? data.filter((obj) => { return obj._id === _id }) : []
    assert.strictEqual(0, obj.length)
    // Mongo Db check
    const dbProfile = await dbGetProfile()
    DB.createMainAccount(dbProfile, false, true)
    DB.createMemberAccount(dbProfile)
    DB.deleteOp(dbProfile, 'compliances', true)
    DB.fetch(dbProfile, 'compliances')
  })

  it('Function delete, throws an error is _id is not send', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    await request(initialQuery)

    const CORPORATE_MEMBER = { first_name: 'Jhon' }
    const query = {
      action: 'saveData',
      'args': [ { ...CORPORATE_MEMBER, auth: AUTH } ]
    }

    await request(query)

    const query2 = {
      action: 'delete',
      'args': [ { auth: AUTH, collection: 'compliances' } ]
    }

    try {
      await request(query2)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: KYC_DELETE_ERROR: Error: KYC_ERROR_MISSING_DATA_ID', e.toString())
    }
  })

  it('Function delete, throws an error is _collection is not send', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    await request(initialQuery)

    const CORPORATE_MEMBER = { first_name: 'Jhon' }
    const query = {
      action: 'saveData',
      'args': [ { ...CORPORATE_MEMBER, auth: AUTH } ]
    }

    const { _id } = await request(query)

    const query2 = {
      action: 'delete',
      'args': [ { _id, auth: AUTH } ]
    }

    try {
      await request(query2)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: KYC_DELETE_ERROR: Error: KYC_ERROR_MISSING_DATA_COLLECTION', e.toString())
    }
  })

  it('Function delete, throws an error if collection is not documents or compliances', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    await request(initialQuery)

    const CORPORATE_MEMBER = { first_name: 'Jhon' }
    const query = {
      action: 'saveData',
      'args': [ { ...CORPORATE_MEMBER, auth: AUTH } ]
    }

    const { _id } = await request(query)

    const query2 = {
      action: 'delete',
      'args': [ { _id, auth: AUTH, collection: 'OTHER' } ]
    }

    try {
      await request(query2)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: KYC_DELETE_ERROR: Error: KYC_ERROR_ONLY_DOCUMENTS_OR_COMPLIANCES_CAN_BE_DELETED', e.toString())
    }
  })

  it('Function delete, throws an error is UID is not send by an Admin', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    await request(initialQuery)

    const CORPORATE_MEMBER = { first_name: 'Jhon' }
    const query = {
      action: 'saveData',
      'args': [ { ...CORPORATE_MEMBER, auth: AUTH } ]
    }

    const { _id } = await request(query)

    const query2 = {
      action: 'delete',
      'args': [ { _id, auth: ADM_AUTH, collection: 'compliances' } ]
    }

    try {
      await request(query2)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: KYC_DELETE_ERROR: Error: KYC_ERROR_MISSING_UID', e.toString())
    }
  })

  it('Function delete, throws an error if trying to delete a main account', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    const { _id } = await request(initialQuery)

    const query2 = {
      action: 'delete',
      'args': [ { _id, auth: AUTH, collection: 'compliances' } ]
    }

    try {
      await request(query2)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: KYC_DELETE_ERROR: Error: KYC_ERROR_CANT_DELETE_A_MAIN_ACCOUNT', e.toString())
    }
  })

  it('Function delete, throws an error if trying to delete some other user account', async () => {
    const AUTH2 = ['FOO', { ip: '188.25.20.91' }]
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    await request(initialQuery)

    const CORPORATE_MEMBER = { first_name: 'Jhon' }
    const query = {
      action: 'saveData',
      'args': [ { ...CORPORATE_MEMBER, auth: AUTH } ]
    }

    const { _id } = await request(query)

    const query2 = {
      action: 'delete',
      'args': [ { _id, auth: AUTH2, collection: 'compliances', uid: UID_OF_AUTH } ]
    }

    try {
      await request(query2)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: KYC_DELETE_ERROR: Error: MUST_BE_ADMIN_OR_DATA_OWNER', e.toString())
    }
  })

  it('Function delete, throws an error if _id dont exists', async () => {
    const _id = 123456

    const query2 = {
      action: 'delete',
      'args': [ { _id, auth: AUTH, collection: 'compliances' } ]
    }

    try {
      await request(query2)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: KYC_DELETE_ERROR: Error: KYC_ERROR_NO_DATA_WAS_FOUND_FOR_THE_SENDED_PARAMETERS', e.toString())
    }
  })

  it('Function delete, works as edition of data, user cant edit submitted data admins can', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const query = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const addCorporateMember = {
      action: 'saveData',
      'args': [ { ...completeMember, auth: AUTH } ]
    }
    const member = await request(addCorporateMember)

    const complete = completeData(true)
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)
    await sleep(100)

    const query3 = {
      action: 'delete',
      'args': [ { _id: member._id, auth: AUTH, collection: 'compliances' } ]
    }

    try {
      await request(query3)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: KYC_DELETE_ERROR: Error: KYC_ERROR_CANT_EDIT_SUBMITTED_DATA_ONLY_CANCEL', e.toString())
    }

    const query4 = {
      action: 'delete',
      'args': [ { _id: member._id, auth: ADM_AUTH, collection: 'compliances', uid: UID_OF_AUTH } ]
    }
    await request(query4)

    const query5 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }

    const data = await request(query5)
    const obj = (data) ? data.filter((obj) => { return obj._id === member._id }) : []
    assert.strictEqual(0, obj.length)
  })

  it('Function saveData should return an error if an admin tries to save without adding a uid or data_id', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: ADM_AUTH } ]
    }
    try {
      await request(query)
      throw new Error('ADMIN_USER_CANT_CREATE_AN_ACCOUNT')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: KYC_ADMINS_CANT_CREATE_AN_ACCOUNT', e.toString())
    }
    // Mongo Db check
    const dbProfile = await dbGetProfile()
    assert.strictEqual(dbProfile.length, 1, 'Should do 1 query in db')
  })

  it('Function saveData, when reset is send it clears all saved data and documents', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'saveDocuments',
      'args': [ { ...VALID_DOCUMENTS, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'saveData',
      'args': [ { _id, reset: true, phone: '111', auth: AUTH } ]
    }
    await request(query3)

    const query4 = {
      action: 'fetch',
      'args': [ { collection: 'documents', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }

    const documents = await request(query4)
    assert.ifError(documents)

    const query5 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }

    const data = await request(query5)
    assert.ifError(data[0].first_name, 'users name should have been deleted')
    assert.ok(data[0].phone)
  })

  it('Function fetch allows to query in small batches using ammount and offset', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, status: 'incomplete', type_account: 'corporate', is_main_account: true, auth: AUTH } ]
    }
    const data = await request(query)
    const save = []
    save.push(data)
    for (let i = 0; i < 9; i++) {
      const query = {
        action: 'saveData',
        'args': [ { first_name: 'Brent', auth: AUTH } ]
      }
      const data = await request(query)
      save.push(data)
    }

    const arrOfIds = []
    for (let i = 0; i < 5; i++) {
      const offset = (2 * i)
      const query2 = {
        action: 'fetch',
        'args': [ { collection: 'compliances', amount: 2, offset, auth: AUTH } ]
      }
      const result = await request(query2)
      assert.strictEqual(result.length, 2)
      result.forEach((data) => {
        assert.strictEqual(arrOfIds.indexOf(data._id), -1)
        arrOfIds.push(data._id)
      })
    }
  })
})

describe('kyc findByType related functions', () => {
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

  it('Function findByType if being the Admin, should return the data being search', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, status: 'incomplete', is_main_account: true, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'findByType',
      'args': [ { type: 'incomplete', amount: LIMIT, offset: OFFSET, auth: ADM_AUTH } ]
    }
    const data = await request(query2)
    const search = data.filter

    const obj = search.filter((obj) => { return obj._id === _id })
    assert.strictEqual(1, obj.length)
    assert.strictEqual('incomplete', obj[0].status)
  })

  it('Search by first and last name at same time', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, first_name: 'Greg', status: 'incomplete', is_main_account: true, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'findByType',
      'args': [ { search: 'greg kirkland', amount: LIMIT, offset: OFFSET, auth: ADM_AUTH } ]
    }
    const data = await request(query2)
    const search = data.filter

    const obj = search.filter((obj) => { return obj._id === _id })
    assert.strictEqual(1, obj.length)
    assert.strictEqual('Greg', obj[0].first_name)
    assert.strictEqual('Kirkland', obj[0].last_name)
  })

  it('Search, Adding quotes, would do all possible combinations of first_name, middle_name and last_name that is strictly similar to what is inside of quotes', async () => {
    const AUTH2 = ['BAR', { ip: '188.25.20.91' }]
    const AUTH3 = ['BAZ', { ip: '188.25.20.91' }]
    const AUTH4 = ['TUB', { ip: '188.25.20.91' }]
    const AUTH5 = ['WUB', { ip: '188.25.20.91' }]
    const AUTH6 = ['BFX', { ip: '188.25.20.91' }]
    const AUTH7 = ['MAX', { ip: '188.25.20.91' }]
    const query = { // false
      action: 'saveData',
      'args': [ { ...VALID_DATA, first_name: 'Greg', status: 'incomplete', is_main_account: true, auth: AUTH } ]
    }
    await request(query)

    const query2 = { // false
      action: 'saveData',
      'args': [ { ...VALID_DATA, first_name: 'Greg', last_name: 'Gregor', status: 'incomplete', is_main_account: true, auth: AUTH2 } ]
    }
    await request(query2)

    const query3 = { // true
      action: 'saveData',
      'args': [ { ...VALID_DATA, first_name: 'Greg', middle_name: 'Mac', last_name: 'Gregor', status: 'incomplete', is_main_account: true, auth: AUTH3 } ]
    }
    await request(query3)

    const query4 = { // false
      action: 'saveData',
      'args': [ { ...VALID_DATA, first_name: 'Greg', middle_name: 'Mac', status: 'incomplete', is_main_account: true, auth: AUTH4 } ]
    }
    await request(query4)

    const query5 = { // true
      action: 'saveData',
      'args': [ { ...VALID_DATA, first_name: 'Greg', middle_name: 'Mac Gregor', status: 'incomplete', is_main_account: true, auth: AUTH5 } ]
    }
    await request(query5)

    const query6 = { // true
      action: 'saveData',
      'args': [ { ...VALID_DATA, first_name: 'Greg', last_name: 'Mac Gregor', status: 'incomplete', is_main_account: true, auth: AUTH6 } ]
    }
    await request(query6)

    const query7 = { // true
      action: 'saveData',
      'args': [ { ...VALID_DATA, first_name: 'Greg Mac Gregor', status: 'incomplete', is_main_account: true, auth: AUTH7 } ]
    }
    await request(query7)

    const query8 = {
      action: 'findByType',
      'args': [ { search: '"Greg Mac Gregor"', amount: LIMIT, offset: OFFSET, auth: ADM_AUTH } ]
    }
    const data = await request(query8)
    const search = data.filter

    assert.strictEqual(4, search.length, 'It should have 4 coincidences')
  })

  it('Function findByType if being the Admin, and with a previous search, should return the data being search and recently', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, status: 'incomplete', is_main_account: true, auth: AUTH } ]
    }
    await request(query)

    const query2 = {
      action: 'fetch',
      'args': [ { auth: ADM_AUTH, collection: 'compliances', uid: UID_OF_AUTH, amount: LIMIT, offset: OFFSET } ]
    }
    await request(query2)

    const query3 = {
      action: 'findByType',
      'args': [ { type: 'incomplete', amount: LIMIT, offset: OFFSET, auth: ADM_AUTH } ]
    }
    const data = await request(query3)
    assert.strictEqual(data.recently[0].status, 'incomplete')
    assert.strictEqual(data.filter[0].status, 'incomplete')
  })

  it('Function findByType if being the Admin, and with a previous search, should only return the data being search, without recently, if offset > 0', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, status: 'incomplete', is_main_account: true, auth: AUTH } ]
    }
    await request(query)

    const query2 = {
      action: 'fetch',
      'args': [ { auth: ADM_AUTH, collection: 'compliances', uid: UID_OF_AUTH, amount: LIMIT, offset: OFFSET } ]
    }
    await request(query2)

    const OFFSET2 = 2
    const query3 = {
      action: 'findByType',
      'args': [ { type: 'incomplete', amount: LIMIT, offset: OFFSET2, auth: ADM_AUTH } ]
    }
    const data = await request(query3)
    assert.ifError(data.recently)
  })

  it('Function findByType should not allow a non Admin user', async () => {
    const query = {
      action: 'findByType',
      'args': [ { type: 'incomplete', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }
    try {
      await request(query)
      throw new Error('NON_ADMIN_USER_SHOULD_NOT_BE_ALLOW')
    } catch (e) {
      const err = e.toString().endsWith('ERR_KYC_MUST_BE_ADMIN_TO_FIND_BY_QUERY')
      assert.ok(err)
    }
  })

  it('Function findByType should allow a filter', async () => {
    const query = {
      action: 'saveData',
      'args': [ { first_name: 'Greg', status: 'incomplete', uid: 1, is_main_account: true, auth: ADM_AUTH } ]
    }
    await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { first_name: 'Tom', status: 'incomplete', uid: 2, is_main_account: true, auth: ADM_AUTH } ]
    }
    await request(query2)
    const query3 = {
      action: 'findByType',
      'args': [{ type: 'incomplete', search: 'Greg', order: 'timestamp', direction: -1, amount: LIMIT, offset: OFFSET, auth: ADM_AUTH }]
    }
    const data = await request(query3)
    assert.ok(data.filter.length)
    data.filter.forEach(d => {
      assert.strictEqual(d.first_name, 'Greg')
    })
  })

  it('Function findByType should allow a search and filter sort', async () => {
    for (let i = 0; i < 10; i++) {
      const uid = parseInt(Math.random() * 1000)
      const query = {
        action: 'saveData',
        'args': [ { first_name: 'Greg', status: 'incomplete', is_main_account: true, uid, auth: ADM_AUTH } ]
      }
      await request(query)
    }
    const query2 = {
      action: 'findByType',
      'args': [ { type: 'incomplete', search: 'Greg', order: 'timestamp', direction: -1, amount: LIMIT, offset: OFFSET, auth: ADM_AUTH } ]
    }
    const data = await request(query2)
    assert.ok(data.filter.length, 'Should have length')
    let timestamp = 99999999999999
    data.filter.forEach(d => {
      assert.ok(timestamp > d.timestamp, 'timestamp > d.timestamp')
      timestamp = d.timestamp
      assert.strictEqual(d.first_name, 'Greg')
    })
  })

  it('Function findByType allows to query in small batches using amount and offset', async () => {
    const save = []
    for (let i = 0; i < 10; i++) {
      const uid = parseInt(Math.random() * 1000)
      const query = {
        action: 'saveData',
        'args': [ { ...VALID_DATA, status: 'incomplete', is_main_account: true, uid, auth: ADM_AUTH } ]
      }
      const data = await request(query)
      save.push(data)
    }

    const arrOfIds = []
    for (let i = 0; i < 5; i++) {
      const offset = 2 * i
      const query2 = {
        action: 'findByType',
        'args': [ { type: 'incomplete', amount: 2, offset, auth: ADM_AUTH } ]
      }
      const data = await request(query2)
      const filter = data.filter
      assert.strictEqual(filter.length, 2)
      filter.forEach((data) => {
        assert.strictEqual(arrOfIds.indexOf(data._id), -1)
        arrOfIds.push(data._id)
      })
    }
  })
})

describe('kyc adminCheckEdit related functions', () => {
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

  it('AdminCheckEdit should mark a timestamp representing that the document has been opened by a certain admin this timestamp is shown to other admins when they check “AdminCheckEdit”', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'adminCheckEdit',
      'args': [ { auth: ADM_AUTH, _id } ]
    }
    await request(query2)

    const adm2 = await request(logQuery(logADM(2)))
    const ADM_AUTH2 = parseAdminAuth(adm2.token)
    const query3 = {
      action: 'adminCheckEdit',
      'args': [ { auth: ADM_AUTH2, _id } ]
    }
    const data = await request(query3)
    assert.ok(data.check.open_timestamp)
    // Mongo Db check
    const dbProfile = await dbGetProfile()
    DB.createMainAccount(dbProfile)
    // Checks admin Token
    assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: 'kyc.adminTokens' }, 'Checks admin token')
    assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: 'kyc.adminChecks' }, 'Checks open files')
    assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: 'kyc.adminChecks' }, 'Checks save files')
    assert.deepStrictEqual(dbProfile.shift(), { op: 'update',
      ns: 'kyc.adminChecks',
      nMatched: 0,
      nModified: 0 }, 'Saves admin token')
    // Creates admin Account
    assert.deepStrictEqual(dbProfile.shift(), { op: 'insert', ns: 'kyc.adminTokens' }, 'Creates admin Account')
    DB.adminCheckEdit(dbProfile)
  })

  it('AdminCheckEdit an admin user should not been shown its own Timestamp', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'adminCheckEdit',
      'args': [ { auth: ADM_AUTH, dataId: _id } ]
    }
    await request(query2)

    const query3 = {
      action: 'adminCheckEdit',
      'args': [ { auth: ADM_AUTH, dataId: _id } ]
    }
    const data = await request(query3)
    assert.deepStrictEqual(data.check, false)
    assert.ifError(data._id)
  })

  it('AdminCheckEdit should not show the Timestamp of an admin user to a non admin user', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'adminCheckEdit',
      'args': [ { auth: AUTH, dataId: _id } ]
    }

    try {
      await request(query2)
      throw new Error('CHECK_ADMIN_TIMESTAMP_WITH_NON_ADMIN_USER')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: ERR_KYC_MUST_BE_ADMIN_TO_CHECK_EDITION_FLAG', e.toString())
    }
  })

  it('AdminCheckEdit If more than one user is seeing the data, it just returns the nearest timestamp', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'adminCheckEdit',
      'args': [ { auth: ADM_AUTH, dataId: _id } ]
    }
    await request(query2)

    const adm2 = await request(logQuery(logADM(2)))
    const ADM_AUTH2 = parseAdminAuth(adm2.token)
    const query3 = {
      action: 'adminCheckEdit',
      'args': [ { auth: ADM_AUTH2, dataId: _id } ]
    }
    const data = await request(query3)
    const timestamp1 = data.check.open_timestamp

    const adm3 = await request(logQuery(logADM(3)))
    const ADM_AUTH3 = parseAdminAuth(adm3.token)
    const query4 = {
      action: 'adminCheckEdit',
      'args': [ { auth: ADM_AUTH3, dataId: _id } ]
    }
    const data2 = await request(query4)
    const timestamp2 = data2.check.open_timestamp
    assert.ok(timestamp2 > timestamp1)
  })

  it('Function saveData + adminCheckEdit, admin saves the data, his own timestamp is marked as "saved_timestamp" and not longer shown to admins that ask adminCheckEdit', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'adminCheckEdit',
      'args': [ { auth: ADM_AUTH, dataId: _id } ]
    }
    await request(query2)

    const query3 = {
      action: 'saveData',
      'args': [ { first_name: 'Change name', nationality: 'USA', _id, auth: ADM_AUTH } ]
    }
    await request(query3)

    const adm2 = await request(logQuery(logADM(2)))
    const ADM_AUTH2 = parseAdminAuth(adm2.token)

    const query4 = {
      action: 'adminCheckEdit',
      'args': [ { auth: ADM_AUTH2, dataId: _id } ]
    }
    const data = await request(query4)
    assert.deepStrictEqual(data.check, false)
    assert.deepStrictEqual(data.saved.compliances_id, _id)
    // Mongo Db check
    const dbProfile = await dbGetProfile()
    DB.createMainAccount(dbProfile)
    DB.adminCheckEdit(dbProfile)
    DB.updateCompliances(dbProfile, true)
    DB.loginAdmin(dbProfile)
    DB.adminCheckEdit(dbProfile)
  })
})

describe('kyc status related functions', () => {
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
  })

  beforeEach(async function () {
    this.timeout(10000)
    const adm1 = await request(logQuery(logADM(1)))
    ADM_AUTH = parseAdminAuth(adm1.token)
    await requestCalls({ action: 'clearCalls' })
    await recordDbTransactions()
  })

  it('On save data, if all sectios_status = 1, data can be submitted (data.status="submitted") and correspondent emails are sent automaticaly', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)
    await sleep(100) // wait for Email to be sent as it is not async

    const query3 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }
    const data = await request(query3)
    assert.strictEqual(data[0].status, 'submitted')
    assert.ok(data[0].digital_signature_submitted)
    const dbProfile = await dbGetProfile()
    DB.createMainAccount(dbProfile)
    DB.updateCompliances(dbProfile, false, true)
    DB.fetch(dbProfile, 'compliances')
    // Check calls on workers
    const calls = await requestCalls({ action: 'getCalls' })
    assert.strictEqual(calls[5].worker, 'ext.sendgrid')
    assert.strictEqual(calls[5].on, 'sendEmail')
  })

  it('On save data (corporate accounts), if all sectios_status = 1, data can be submitted (data.status="submitted") and correspondent emails are sent automaticaly', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const query = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const addCorporateMember = {
      action: 'saveData',
      'args': [ { ...completeMember, auth: AUTH } ]
    }
    await request(addCorporateMember)

    const complete = completeData(true)
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)
    await sleep(100) // wait for Email to be sent as it is not async

    const query3 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }
    const data = await request(query3)
    assert.strictEqual(data[0].status, 'submitted')
    assert.ok(data[0].digital_signature_submitted)
    const dbProfile = await dbGetProfile()
    DB.createMainAccount(dbProfile, false, true)
    DB.createMemberAccount(dbProfile)
    DB.updateCompliances(dbProfile, false, true, true)
    DB.fetch(dbProfile, 'compliances')
    // Check calls on workers */
    const calls = await requestCalls({ action: 'getCalls' })
    assert.strictEqual(calls[6].worker, 'ext.sendgrid')
    assert.strictEqual(calls[6].on, 'sendEmail')
  })

  it('On save data (corporate accounts), data keeps cant be submitted if all members are not completed', async () => {
    const COPORATE_DATA = { ...VALID_DATA, status: 'incomplete' }
    COPORATE_DATA.type_account = 'corporate'
    const query = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const addCorporateMember = {
      action: 'saveData',
      'args': [ { first_name: 'Jhon', auth: AUTH } ]
    }
    await request(addCorporateMember)

    const complete = completeData(true)
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    try {
      await request(query2)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_ERROR_DATA_IS_MISSING_CANT_BE_SUBMITTED')
      assert.ok(error)
    }
  })

  it('When data is submitted a field checked_by_admin is set to false that is returned “findByType” and “fetch”', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'findByType',
      'args': [ { type: 'submitted', amount: LIMIT, offset: OFFSET, auth: ADM_AUTH } ]
    }
    const data = await request(query3)
    assert.strictEqual(data.filter.length, 1)
    assert.strictEqual(data.filter[0].checked_by_admin, false)

    const query4 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, uid: UID_OF_AUTH, auth: ADM_AUTH } ]
    }
    const data2 = await request(query4)
    assert.strictEqual(data2[0].status, 'submitted')
    assert.strictEqual(data2[0].checked_by_admin, false)
  })

  it('Users are not able to see field checked_by_admin', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }
    const data = await request(query3)
    assert.strictEqual(data[0].status, 'submitted')
    assert.strictEqual(data[0].checked_by_admin, undefined)
  })

  it('After an admin fetches data, checked_by_admin, is set to true. ', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, uid: UID_OF_AUTH, auth: ADM_AUTH } ]
    }
    const data = await request(query3)
    assert.strictEqual(data[0].status, 'submitted')
    assert.strictEqual(data[0].checked_by_admin, false)

    const query4 = {
      action: 'findByType',
      'args': [ { type: 'submitted', amount: LIMIT, offset: OFFSET, auth: ADM_AUTH } ]
    }
    const data2 = await request(query4)
    assert.strictEqual(data2.filter.length, 1)
    assert.strictEqual(data2.filter[0].checked_by_admin, true)
  })

  it('Once data is submitted admin can set status to “pending”', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'saveData',
      'args': [ { _id, status: 'pending', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(query3)

    const query4 = {
      action: 'findByType',
      'args': [ { type: 'pending', amount: LIMIT, offset: OFFSET, auth: ADM_AUTH } ]
    }
    const data = await request(query4)
    assert.strictEqual(data.filter.length, 1)
  })

  it('Users cant set status to “pending”', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'saveData',
      'args': [ { _id, status: 'pending', auth: AUTH } ]
    }

    try {
      await request(query3)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_MUST_BE_ADMIN_TO_CHANGE_THIS_DATA')
      assert.ok(error)
    }
  })

  it('If data is set to pending users can edit the data, no matter approval has started', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const partialApproved = {
      kyc_section_status: 2,
      contact_section_status: 2,
      address_section_status: 2
    }

    const query3 = {
      action: 'saveData',
      'args': [ { _id, ...partialApproved, auth: ADM_AUTH } ]
    }
    await request(query3)

    const query4 = {
      action: 'saveData',
      'args': [ { _id, status: 'pending', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(query4)

    const query5 = {
      action: 'saveData',
      'args': [ { _id, first_name: 'Change', auth: AUTH } ]
    }
    await request(query5)

    const query6 = {
      action: 'findByType',
      'args': [ { type: 'pending', amount: LIMIT, offset: OFFSET, auth: ADM_AUTH } ]
    }
    const data = await request(query6)
    assert.strictEqual(data.filter.length, 1)
    assert.strictEqual(data.filter[0].first_name, 'Change')
  })

  it('On save data, if all sectios_status = 2, data is automaticaly set it up as verified and send correspondent email', async () => {
    const verified = {
      kyc_section_status: 2,
      contact_section_status: 2,
      address_section_status: 2,
      identity_section_status: 2,
      financial_section_status: 2
    }
    const complete = completeData()
    const queryS = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(queryS)

    const query = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...verified, auth: ADM_AUTH } ]
    }
    await request(query2)
    await sleep(100) // wait for Email to be sent as it is not async

    const query3 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }

    const data = await request(query3)
    assert.strictEqual(data[0].status, 'verified')
    assert.ok(data[0].digital_signature_verified)
    const dbProfile = await dbGetProfile()

    DB.createMainAccount(dbProfile)
    DB.updateCompliances(dbProfile, false, true)
    DB.updateCompliances(dbProfile, true, true, false, false)
    DB.fetch(dbProfile, 'compliances')

    // Check calls on workers
    const calls = await requestCalls({ action: 'getCalls' })
    assert.strictEqual(calls[5].worker, 'ext.sendgrid')
    assert.strictEqual(calls[5].on, 'sendEmail')
  })

  it('SaveData admits verification_timestamp as to check that data has not been modified from last time opened', async () => {
    const complete = completeData()
    const queryS = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(queryS)

    const query = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    const { timestamp } = await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, kyc_section_status: 2, verification_timestamp: timestamp, auth: ADM_AUTH } ]
    }
    const ok = await request(query2)
    assert.ok(ok)

    const query3 = {
      action: 'saveData',
      'args': [ { _id, identity_section_status: 2, verification_timestamp: timestamp, auth: ADM_AUTH } ]
    }

    try {
      await request(query3)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_DATA_HAD_BEEN_MODIFIED_FROM_THE_verification_timestamp_SEND')
      assert.ok(error)
    }
  })

  it('Users cant aprove their selves only Admins can approve users', async () => {
    const complete = {
      kyc_section_status: 2,
      contact_section_status: 2,
      address_section_status: 2,
      corporate_section_status: 2,
      identity_section_status: 2,
      financial_section_status: 2
    }
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    try {
      await request(query2)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_MUST_BE_ADMIN_TO_CHANGE_THIS_DATA')
      assert.ok(error)
    }
  })

  it('Function process if sent  data _id and parameter “status:canceled”, cancels the data setting all status to 0 and removing submitted signature', async () => {
    const complete = completeData()
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'process',
      'args': [ { _id, status: 'canceled', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(query3)

    const query4 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }

    const data = await request(query4)
    assert.strictEqual(data[0].status, 'canceled')
    assert.strictEqual(data[0].kyc_section_status, 0)
    assert.strictEqual(data[0].contact_section_status, 0)
    assert.strictEqual(data[0].address_section_status, 0)
    assert.strictEqual(data[0].identity_section_status, 0)
    assert.strictEqual(data[0].financial_section_status, 0)
    assert.ok(data[0].digital_signature_canceled)
    assert.ifError(data[0].digital_signature_submitted)
  })

  it('Function process if sent  data _id and parameter “status:refused, refused the data setting all status to 3', async () => {
    const complete = completeData()
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'process',
      'args': [ { _id, status: 'refused', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(query3)

    const query4 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }

    const data = await request(query4)
    assert.strictEqual(data[0].status, 'refused')
    assert.strictEqual(data[0].kyc_section_status, 3)
    assert.strictEqual(data[0].contact_section_status, 3)
    assert.strictEqual(data[0].address_section_status, 3)
    assert.strictEqual(data[0].identity_section_status, 3)
    assert.strictEqual(data[0].financial_section_status, 3)
    assert.ok(data[0].digital_signature_refused)
  })

  it('Function process if sent  data _id and parameter “status:unrefused, the data return to submited to 1', async () => {
    const complete = completeData()
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'process',
      'args': [ { _id, status: 'refused', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(query3)

    const query4 = {
      action: 'process',
      'args': [ { _id, status: 'unrefused', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(query4)

    const query5 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }

    const data = await request(query5)
    assert.strictEqual(data[0].status, 'submitted')
    assert.strictEqual(data[0].kyc_section_status, 1)
    assert.strictEqual(data[0].contact_section_status, 1)
    assert.strictEqual(data[0].address_section_status, 1)
    assert.strictEqual(data[0].identity_section_status, 1)
    assert.strictEqual(data[0].financial_section_status, 1)
  })

  it('Function process cant be used with other status rather than canceled or refused', async () => {
    const query = {
      action: 'process',
      'args': [ { _id: 'someid', 'status': 'other', auth: ADM_AUTH } ]
    }
    try {
      await request(query)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_ERROR_INVALID_DATA_STATUS')
      assert.ok(error)
    }
  })

  it('Function process cant be used if not being an admin', async () => {
    const query = {
      action: 'process',
      'args': [ { _id: 'someid', 'status': 'refused', auth: AUTH } ]
    }
    try {
      await request(query)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_MUST_BE_ADMIN_TO_EDIT_PROCESS')
      assert.ok(error)
    }
  })

  it('Function process cant be used without data id', async () => {
    const query = {
      action: 'process',
      'args': [ { 'status': 'refused', auth: ADM_AUTH } ]
    }
    try {
      await request(query)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_ERROR_MISSING_DATA_ID')
      assert.ok(error)
    }
  })

  it('Function process cant be used without sending the status', async () => {
    const query = {
      action: 'process',
      'args': [ { _id: 'someid', auth: ADM_AUTH } ]
    }
    try {
      await request(query)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_ERROR_MISSING_DATA_STATUS')
      assert.ok(error)
    }
  })

  it('Function process cant be used without sending the note', async () => {
    const query = {
      action: 'process',
      'args': [ { _id: 'someid', status: 'refused', auth: ADM_AUTH } ]
    }
    try {
      await request(query)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_EDIT_STATUS_MUST_HAVE_NOTES')
      assert.ok(error)
    }
  })

  it('On save data and on process if notify== “false” emails are not send', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const complete = completeData()
    const notify = false
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, notify, auth: AUTH } ]
    }
    await request(query2)
    await sleep(100) // wait for Email to be sent as it is not async

    const query3 = {
      action: 'process',
      'args': [ { _id, status: 'canceled', notes: 'a note', notify, auth: ADM_AUTH } ]
    }
    await request(query3)

    // Check calls on workers
    const calls = await requestCalls({ action: 'getCalls' })
    for (const call in calls) {
      assert.notStrictEqual(calls[call].worker, 'ext.sendgrid')
    }
  })

  it('verifiedUser when send users uid returns true if users is verified', async () => {
    const verified = {
      kyc_section_status: 2,
      contact_section_status: 2,
      address_section_status: 2,
      identity_section_status: 2,
      financial_section_status: 2
    }
    const complete = completeData()
    const queryS = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(queryS)

    const query = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...verified, auth: ADM_AUTH } ]
    }
    await request(query2)
    // user BIX, uid = 14673331, email: BIX@email.com
    const query3 = {
      action: 'verifiedUser',
      'args': [ { uid: 14673331 } ]
    }

    const verifiedUser = await request(query3)
    assert.strictEqual(verifiedUser, true)
  })

  it('verifiedUser when send users core_email returns true if users is verified', async () => {
    const verified = {
      kyc_section_status: 2,
      contact_section_status: 2,
      address_section_status: 2,
      identity_section_status: 2,
      financial_section_status: 2
    }
    const complete = completeData()
    const queryS = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(queryS)

    const query = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...verified, auth: ADM_AUTH } ]
    }
    await request(query2)
    // user BIX, uid = 14673331, email: BIX@email.com
    const query3 = {
      action: 'verifiedUser',
      'args': [ { core_email: 'BIX@email.com' } ]
    }

    const verifiedUser = await request(query3)
    assert.strictEqual(verifiedUser, true)
  })

  it('verifiedUser when send users uid / email or other unique data returns false if users is not verified', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    await request(query)
    // user BIX, uid = 14673331, email: BIX@email.com
    const query2 = {
      action: 'verifiedUser',
      'args': [ { uid: 14673331 } ]
    }

    const verified = await request(query2)
    assert.strictEqual(verified, false)
  })

  it('Users can cancel the process once the data is send', async () => {
    const complete = completeData()
    const queryS = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(queryS)

    const query = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, status: 'canceled', auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }
    const fetchData = await request(query3)
    assert.strictEqual(fetchData[0].status, 'canceled')
  })

  it('After canceling the data users can resume process returning to incomplete status without loosing data', async () => {
    const complete = { ...VALID_DATA, ...completeData() }
    complete.first_name = VALID_DATA.first_name
    const queryS = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(queryS)

    const query = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, status: 'canceled', auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'saveData',
      'args': [ { _id, status: 'incomplete', auth: AUTH } ]
    }
    await request(query3)

    const query4 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }
    const fetchData = await request(query4)
    assert.strictEqual(fetchData[0].status, 'incomplete')
    assert.strictEqual(fetchData[0].first_name, VALID_DATA.first_name)
  })

  it('Users cant edit data once is submitted ', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)
    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'saveData',
      'args': [ { _id, first_name: 'edit', auth: AUTH } ]
    }

    try {
      await request(query3)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_ERROR_CANT_EDIT_SUBMITTED_DATA_ONLY_CANCEL')
      assert.ok(error)
    }
  })

  it('Users (corporate) cant add more members once data is submitted ', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const query = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const addCorporateMember = {
      action: 'saveData',
      'args': [ { ...completeMember, auth: AUTH } ]
    }
    const member = await request(addCorporateMember)

    const complete = completeData(true)
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'saveData',
      'args': [ { _id: member._id, first_name: 'edit', auth: AUTH } ]
    }

    try {
      await request(query3)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_ERROR_CANT_EDIT_SUBMITTED_DATA_ONLY_CANCEL')
      assert.ok(error)
    }
  }).timeout(200000)

  it('Users can cancel data once submitted', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'saveData',
      'args': [ { _id, status: 'canceled', auth: AUTH } ]
    }

    const cancel = await request(query3)
    assert.ok(cancel)
  })

  it('Users cant cancel data if the verification process has started', async () => {
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const complete = completeData()
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'saveData',
      'args': [ {
        _id,
        kyc_section_status: 2,
        auth: ADM_AUTH } ]
    }
    await request(query3)
    const query4 = {
      action: 'saveData',
      'args': [ { _id, status: 'canceled', auth: AUTH } ]
    }

    try {
      await request(query4)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_ERROR_CANT_CANCELED_AS_VERIFICATION_PROCESS_STARTED')
      assert.ok(error)
    }
  })

  it('Users cant cancel data if the verification process has started (test on corporate member) ', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const query = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const addCorporateMember = {
      action: 'saveData',
      'args': [ { ...completeMember, auth: AUTH } ]
    }
    const member = await request(addCorporateMember)

    const complete = completeData(true)
    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'saveData',
      'args': [ {
        _id: member._id,
        address_section_status: 2,
        auth: ADM_AUTH } ]
    }
    await request(query3)
    const query4 = {
      action: 'saveData',
      'args': [ { _id, status: 'canceled', auth: AUTH } ]
    }

    try {
      await request(query4)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_ERROR_CANT_CANCELED_AS_VERIFICATION_PROCESS_STARTED')
      assert.ok(error)
    }
  })

  it('A member cant be added  if its not related to a main account ', async () => {
    const MEMBER = { first_name: 'Brent', last_name: 'Kirkland' }
    const query = {
      action: 'saveData',
      'args': [ { ...MEMBER, auth: AUTH } ]
    }

    try {
      await request(query)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_NO_MAIN_ACCOUNT_FOUNDED')
      assert.ok(error)
    }
  })

  it('Members cant be set up a data status, status are only for main accounts', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const query = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    await request(query)

    const addCorporateMember = {
      action: 'saveData',
      'args': [ { ...completeMember, auth: AUTH } ]
    }
    const { _id } = await request(addCorporateMember)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, status: 'submitted', auth: ADM_AUTH } ]
    }

    try {
      await request(query2)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_CANT_SET_STATUS_TO_A_MEMBER')
      assert.ok(error)
    }
  })

  it('Cant submitted data if there are fields missing', async () => {
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }

    const { _id } = await request(initialQuery)

    const complete = completeData()
    delete complete.phone
    const query = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }

    try {
      await request(query)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_ERROR_DATA_IS_MISSING_CANT_BE_SUBMITTED')
      assert.ok(error)
    }
  })

  it('Reset can only be done from a main account', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const query = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    await request(query)

    const addCorporateMember = {
      action: 'saveData',
      'args': [ { ...completeMember, auth: AUTH } ]
    }
    const { _id } = await request(addCorporateMember)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, reset: true, auth: AUTH } ]
    }

    try {
      await request(query2)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_ERROR_CANT_RESET_FROM_A_MEMBER_ACCOUNT')
      assert.ok(error)
    }
  })

  it('Cant change data, not even as admin if data is refused', async () => {
    const complete = completeData()
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'process',
      'args': [ { _id, status: 'refused', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(query3)

    const query4 = {
      action: 'saveData',
      'args': [ { _id, first_name: 'edit', auth: ADM_AUTH } ]
    }

    try {
      await request(query4)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_ERROR_CANT_EDIT_REFUSED_DATA_ONLY_UNREFUSED_THROUGH_PROCESS')
      assert.ok(error)
    }
  })

  it('Cant change data, not even as admin if data is canceled', async () => {
    const complete = completeData()
    const query = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'saveData',
      'args': [ { _id, ...complete, auth: AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'process',
      'args': [ { _id, status: 'canceled', notes: 'a note', auth: ADM_AUTH } ]
    }
    await request(query3)

    const query4 = {
      action: 'saveData',
      'args': [ { _id, first_name: 'edit', auth: ADM_AUTH } ]
    }

    try {
      await request(query4)
      throw new Error('SHOULD_NOT_REACH_THIS_POINT')
    } catch (e) {
      const error = e.toString().endsWith('KYC_ERROR_CANT_EDIT_CANCELED_DATA_ONLY_RESUMED')
      assert.ok(error)
    }
  })

  it('If a new corporate member is added, “identity_section_status” goes from 1 to 0 (considering that previous corporate members where complete and the one added is not), (data should be refresh as to see the changes)', async () => {
    const COPORATE_DATA = { ...VALID_DATA }
    COPORATE_DATA.type_account = 'corporate'
    const query = {
      action: 'saveData',
      'args': [ { ...COPORATE_DATA, auth: AUTH } ]
    }
    const { _id } = await request(query)

    const addCorporateMember = {
      action: 'saveData',
      'args': [ { ...completeMember, auth: AUTH } ]
    }
    await request(addCorporateMember)

    const refresh = {
      action: 'saveData',
      'args': [ { _id, auth: AUTH } ]
    }
    await request(refresh)

    const query2 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }
    const fetchData = await request(query2)
    for (const a in fetchData) {
      if (fetchData[a].is_main_account) {
        assert.strictEqual(fetchData[a].identity_section_status, 1)
      }
    }

    const addCorporateMember2 = {
      action: 'saveData',
      'args': [ { first_name: 'Jhon', auth: AUTH } ]
    }
    await request(addCorporateMember2)

    await request(refresh)
    const query3 = {
      action: 'fetch',
      'args': [ { collection: 'compliances', amount: LIMIT, offset: OFFSET, auth: AUTH } ]
    }
    const fetchData2 = await request(query3)
    for (const a in fetchData) {
      if (fetchData2[a].is_main_account) {
        assert.strictEqual(fetchData2[a].identity_section_status, 0)
      }
    }
  })
})
