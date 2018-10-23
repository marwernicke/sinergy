/* eslint-env mocha */

'use strict'

const assert = require('assert')

const {
  dropDb,
  recordDbTransactions,
  dbGetProfile
} = require('./workers')

const {
  AUTH,
  UID_OF_AUTH,
  RID,
  logADM,
  logQuery,
  parseAdminAuth,
  VALID_DATA,
  VALID_DOCUMENTS,
  LIMIT,
  OFFSET,
  completeData
} = require('./helpers.data')

const DB = require('./helpers.dbProfile')

const {
  startEnviroment,
  stopEnviroment
} = require('./helpers.boot')

let request, requestCalls, ADM_AUTH

describe('kyc testing forms', () => {
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

  it('Function saveFormsData when receives a valid Rid saves the data to the user', async () => {
    const params = {
      rid: RID
    }
    const query = {
      action: 'saveFormsData',
      'args': [ { ...VALID_DATA, ...params } ]
    }

    const data = await request(query)
    assert.ok(data)
    // Mongo Db check
    const dbProfile = await dbGetProfile()
    DB.createMainAccount(dbProfile)
  })

  it('Function  saveFormsData when receives non valid Rid returns an error', async () => {
    const params = {
      rid: 'no valid rid'
    }
    const query = {
      action: 'saveFormsData',
      'args': [ { ...VALID_DATA, ...params } ]
    }

    try {
      await request(query)
      throw new Error('SAVED_DATA_WITH_A_NON_VALID_RID')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: ERR_NOT_VALID_RID', e.toString())
    }
  })

  it('Function saveFormsData when recives a form id creates a variable form {$id}=true as to check if user had submitted that form', async () => {
    const params = {
      rid: RID,
      form: 1234
    }
    const query = {
      action: 'saveFormsData',
      'args': [ { ...VALID_DATA, ...params } ]
    }
    const { _id } = await request(query)

    const query2 = {
      action: 'fetch',
      'args': [ { auth: AUTH, collection: 'compliances', uid: UID_OF_AUTH, amount: LIMIT, offset: OFFSET } ]
    }
    const data = await request(query2)
    const obj = data.filter((obj) => { return obj._id === _id })
    assert.strictEqual(1, obj.length)
    assert.strictEqual(VALID_DATA.fullname, obj[0].fullname)
    assert.strictEqual(VALID_DATA.address, obj[0].address)
    assert.ok(obj[0].form1234)
  })

  it('Function saveFormsDocuments when receives files in an array and a valid Rid uploads the file to s3', async () => {
    const params = {
      rid: RID
    }
    const query = {
      action: 'saveFormsDocuments',
      'args': [ { ...VALID_DOCUMENTS, ...params } ]
    }
    const save = await request(query)
    const dataId = save[0]._id

    const query2 = {
      action: 'fetch',
      'args': [ { auth: AUTH, collection: 'documents', uid: UID_OF_AUTH, amount: LIMIT, offset: OFFSET } ]
    }
    const data = await request(query2)

    const obj = data.filter((obj) => { return obj._id === dataId })
    assert.strictEqual(1, obj.length)
    assert.strictEqual(VALID_DOCUMENTS.documents[0].filename, obj[0].filename)
    assert.strictEqual(VALID_DOCUMENTS.documents[0].type, obj[0].type)
    assert.ok(obj[0].url.includes('http'))
    // Mongo Db check
    const dbProfile = await dbGetProfile()
    assert.strictEqual(dbProfile.length, 2, 'Should only do 2 queries in db')
    assert.strictEqual(dbProfile[0].op, 'update', 'Should be an update operation')
    assert.ok(dbProfile[0].ns.endsWith('documents'), 'Data should be inserted in "documents" collection')
    assert.strictEqual(dbProfile[1].op, 'query', 'Second call must be a query operation')
  })

  it('Function  saveFormsDocuments when receives non valid Rid returns an error', async () => {
    const params = {
      rid: 'NonValidRid'
    }
    const query = {
      action: 'saveFormsDocuments',
      'args': [ { ...VALID_DOCUMENTS, ...params } ]
    }

    try {
      await request(query)
      throw new Error('SAVED_DATA_WITH_A_NON_VALID_RID')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: ERR_NOT_VALID_RID', e.toString())
    }
  })

  it('Function  saveFormsDocuments when receives files that are not in an array returns an error', async () => {
    const params = {
      rid: RID
    }
    const docs = {
      documents: {
        type: 'passport',
        data: 'data:image/png;base64,iVBORw0KGgoAAAAUVORK5CYII=',
        filename: 'example.png'
      }
    }
    const query = {
      action: 'saveFormsDocuments',
      'args': [ { ...docs, ...params } ]
    }

    try {
      await request(query)
      throw new Error('NON_ARRAY_DATA_SHOULD_NOT_BE_ALLOWED')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: ERR_SAVE_DOCUMENTS_DATA_MUST_BE_ARRAY', e.toString())
    }
  })

  it('Function  saveFormsDocuments when recives a form id ads a variable form:id for each file saved as to check if user had uploaded that form', async () => {
    const params = {
      rid: RID,
      form: 1234
    }
    const query = {
      action: 'saveFormsDocuments',
      'args': [ { ...VALID_DOCUMENTS, ...params } ]
    }
    const save = await request(query)
    const dataId = save[0]._id

    const query2 = {
      action: 'fetch',
      'args': [ { auth: AUTH, collection: 'documents', uid: UID_OF_AUTH, amount: LIMIT, offset: OFFSET } ]
    }
    const data = await request(query2)
    const obj = data.filter((obj) => { return obj._id === dataId })
    assert.strictEqual(1, obj.length)
    assert.strictEqual(VALID_DOCUMENTS.documents[0].filename, obj[0].filename)
    assert.strictEqual(VALID_DOCUMENTS.documents[0].type, obj[0].type)
    assert.strictEqual(params.form, obj[0].form)
    assert.ok(obj[0].url.includes('http'))
  })

  it('Users can send a special form even though verification process has started', async () => {
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
        auth: ADM_AUTH
      } ]
    }
    await request(query3)

    const params = {
      rid: RID
    }
    const query4 = {
      action: 'saveFormsData',
      'args': [ { _id, language: 'new', ...params } ]
    }
    const save = await request(query4)
    assert.ok(save)
  })

  it('Users can send a special form even though verification is verified', async () => {
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
        contact_section_status: 2,
        address_section_status: 2,
        corporate_section_status: 2,
        identity_section_status: 2,
        financial_section_status: 2,
        auth: ADM_AUTH
      } ]
    }
    await request(query3)

    const params = {
      rid: RID
    }
    const query4 = {
      action: 'saveFormsData',
      'args': [ { _id, language: 'new', ...params } ]
    }
    const save = await request(query4)
    assert.ok(save)
  })
})
