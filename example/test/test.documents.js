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
  logADM,
  logQuery,
  parseAdminAuth,
  VALID_DATA,
  VALID_DOCUMENTS,
  LIMIT,
  OFFSET
} = require('./helpers.data')

const {
  startEnviroment,
  stopEnviroment
} = require('./helpers.boot')

let request, requestCalls, ADM_AUTH

describe('kyc testing documents related functions', () => {
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

  it('Function saveDocuments should upload the docuements to s3 and save data to mongo returning the IDs of the documents uploaded which can be used to obtain the URL', async () => {
    const query = {
      action: 'saveDocuments',
      'args': [ { ...VALID_DOCUMENTS, auth: AUTH } ]
    }
    const data = await request(query)
    const dataId = data[0]._id
    const query2 = {
      action: 'fetch',
      'args': [ { auth: AUTH, collection: 'documents', amount: LIMIT, offset: OFFSET } ]
    }
    const docs = await request(query2)
    const obj = docs.filter((obj) => { return obj._id === dataId })
    assert.strictEqual(1, obj.length)
    assert.strictEqual(VALID_DOCUMENTS.documents[0].filename, obj[0].filename)
    assert.strictEqual(VALID_DOCUMENTS.documents[0].type, obj[0].type)
    assert.strictEqual(VALID_DOCUMENTS.documents[0].account_id, obj[0].account_id)
    assert.ok(obj[0].url.includes('http'))

    // Mongo Db check
    const dbProfile = await dbGetProfile()
    assert.strictEqual(dbProfile.length, 2, 'Should only do 2 queries in db, 1 for saving (1 per document) and 1 for fetching')
    assert.strictEqual(dbProfile[0].op, 'update', 'Should be an update operation')
    assert.ok(dbProfile[0].ns.endsWith('documents'), 'Data should be inserted in "compliances" collection')
    assert.strictEqual(dbProfile[1].op, 'query', 'Should be a query operation')
    // Check calls on workers
    const calls = await requestCalls({ action: 'getCalls' })
    assert.strictEqual(calls.length, 3, 'Should do 3 calls, 2 for user validation (1 per call) and 1 to s3')
    assert.strictEqual(calls[0].worker, 'user.core')
    assert.strictEqual(calls[0].on, 'checkAuthToken')
    assert.strictEqual(calls[1].worker, 'ext.s3')
    assert.strictEqual(calls[1].on, 'uploadPublic')
    assert.strictEqual(calls[2].worker, 'user.core')
    assert.strictEqual(calls[2].on, 'checkAuthToken')
  }).timeout(10000)

  it('Function saveDocuments should upload more than 1 docuement at a time', async () => {
    const VALID_DOCUMENTS = {
      documents: [
        {
          type: 'passport',
          data: 'data:image/png;base64,iVBORw0KGgoAAAAUVORK5CYII=',
          filename: 'example.png'
        }, {
          type: 'id',
          data: 'data:image/png;base64,iVBORw0KGgoAAAAUVORK5CYII=',
          filename: 'idexample.png'
        }
      ]
    }
    const query = {
      action: 'saveDocuments',
      'args': [ { ...VALID_DOCUMENTS, auth: AUTH } ]
    }
    await request(query)

    const query2 = {
      action: 'fetch',
      'args': [ { auth: AUTH, collection: 'documents', amount: LIMIT, offset: OFFSET } ]
    }
    const docs = await request(query2)
    assert.strictEqual(2, docs.length)

    // Mongo Db check
    const dbProfile = await dbGetProfile()
    assert.strictEqual(dbProfile.length, 3, 'Should only do 3 queries in db, 2 for saving (1 per document) and 1 for fetching')
    assert.strictEqual(dbProfile[0].op, 'update', 'Should be an update operation')
    assert.ok(dbProfile[0].ns.endsWith('documents'), 'Data should be inserted in "compliances" collection')
    assert.strictEqual(dbProfile[1].op, 'update', 'Should be an update operation')
    assert.ok(dbProfile[1].ns.endsWith('documents'), 'Data should be inserted in "compliances" collection')
    assert.strictEqual(dbProfile[2].op, 'query', 'Should be a query operation')
  }).timeout(10000)

  it('Function saveDocuments If a document is marked as is_private: true it can only be Fetch by admins', async () => {
    const VALID_DOCUMENTS = {
      documents: [
        {
          type: 'passport',
          data: 'data:image/png;base64,iVBORw0KGgoAAAAUVORK5CYII=',
          filename: 'example.png',
          is_private: true
        }, {
          type: 'id',
          data: 'data:image/png;base64,iVBORw0KGgoAAAAUVORK5CYII=',
          filename: 'idexample.png'
        }
      ]
    }
    const query = {
      action: 'saveDocuments',
      'args': [ { ...VALID_DOCUMENTS, auth: AUTH } ]
    }
    await request(query)

    const query2 = {
      action: 'fetch',
      'args': [ { auth: AUTH, collection: 'documents', amount: LIMIT, offset: OFFSET } ]
    }
    const docs = await request(query2)
    assert.strictEqual(1, docs.length)

    const query3 = {
      action: 'fetch',
      'args': [ { auth: ADM_AUTH, uid: UID_OF_AUTH, collection: 'documents', amount: LIMIT, offset: OFFSET } ]
    }
    const docsAdmin = await request(query3)
    assert.strictEqual(2, docsAdmin.length)
  }).timeout(10000)

  it('Function saveDocuments should return an error if an admin tries to save without adding a uid or data_id', async () => {
    const query = {
      action: 'saveDocuments',
      'args': [ { ...VALID_DOCUMENTS, auth: ADM_AUTH } ]
    }
    try {
      await request(query)
      throw new Error('ADMIN_USER_CANT_CREATE_AN_ACCOUNT')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: API_ERROR_UPLOADED_NO_UID', e.toString())
    }

    // Mongo Db check
    const dbProfile = await dbGetProfile()
    assert.strictEqual(dbProfile.length, 1, '1 Query, only ADM check')
    assert.strictEqual(dbProfile[0].op, 'query', 'Should be an query operation')
    assert.ok(dbProfile[0].ns.endsWith('adminTokens'), 'Data should be check in "adminTokens" collection')
  })

  it('Function save document can edit documents data without uploading new files to s3', async () => {
    const query = {
      action: 'saveDocuments',
      'args': [ { ...VALID_DOCUMENTS, auth: AUTH } ]
    }
    const data = await request(query)
    const dataId = data[0]._id
    const editDocsData = {
      documents: [{
        _id: dataId,
        filename: 'change.png',
        account_id: 'idnew'
      }]
    }
    const query2 = {
      action: 'saveDocuments',
      'args': [ { ...editDocsData, auth: AUTH } ]
    }

    const data2 = await request(query2)
    const dataId2 = data2[0]._id
    assert.strictEqual(dataId, dataId2)

    const query3 = {
      action: 'fetch',
      'args': [ { auth: AUTH, collection: 'documents', amount: LIMIT, offset: OFFSET, uid: UID_OF_AUTH } ]
    }
    const fetch = await request(query3)
    const obj = fetch.filter((obj) => { return obj._id === dataId })

    assert.strictEqual('change.png', obj[0].filename)
    assert.strictEqual('idnew', obj[0].account_id)
    // Mongo Db check
    const dbProfile = await dbGetProfile()
    assert.strictEqual(dbProfile.length, 3, 'Should only do 3 queries in db, 2 for saving (1 document + 1 update) and 1 for fetching')
    assert.strictEqual(dbProfile[0].op, 'update', 'Should be an update operation')
    assert.ok(dbProfile[0].ns.endsWith('documents'), 'Data should be inserted in "compliances" collection')
    assert.strictEqual(dbProfile[1].op, 'update', 'Should be an update operation')
    assert.strictEqual(dbProfile[1].nModified, 1, 'Should modified 1 object')
    assert.ok(dbProfile[1].ns.endsWith('documents'), 'Data should be inserted in "compliances" collection')
    assert.strictEqual(dbProfile[2].op, 'query', 'Should be a query operation')
    // Check calls on workers
    const calls = await requestCalls({ action: 'getCalls' })
    assert.strictEqual(calls.length, 4, 'Should do 4 calls, 3 for user validation (1 per call) and 1 to s3')
    assert.strictEqual(calls[0].worker, 'user.core')
    assert.strictEqual(calls[0].on, 'checkAuthToken')
    assert.strictEqual(calls[1].worker, 'ext.s3')
    assert.strictEqual(calls[1].on, 'uploadPublic')
    assert.strictEqual(calls[2].worker, 'user.core')
    assert.strictEqual(calls[2].on, 'checkAuthToken')
    assert.strictEqual(calls[3].worker, 'user.core')
    assert.strictEqual(calls[3].on, 'checkAuthToken')
  }).timeout(10000)

  it('Function save document can add remark without uploading new files to s3', async () => {
    const query = {
      action: 'saveDocuments',
      'args': [ { ...VALID_DOCUMENTS, auth: AUTH } ]
    }
    const data = await request(query)
    const dataId = data[0]._id
    const editDocsData = { documents: [{ _id: dataId, remark: 'some remark' }] }
    const query2 = {
      action: 'saveDocuments',
      'args': [ { ...editDocsData, auth: AUTH } ]
    }

    const data2 = await request(query2)
    const dataId2 = data2[0]._id
    assert.strictEqual(dataId, dataId2)

    const query3 = {
      action: 'fetch',
      'args': [ { auth: AUTH, collection: 'documents', amount: LIMIT, offset: OFFSET, uid: UID_OF_AUTH } ]
    }
    const fetch = await request(query3)
    const obj = fetch.filter((obj) => { return obj._id === dataId })

    assert.strictEqual('some remark', obj[0].remark)
  }).timeout(10000)

  it('Function saveDocuments if receive data that is not in an array returns an error', async () => {
    const docs = {
      documents: {
        type: 'passport',
        data: 'data:image/png;base64,iVBORw0KGgoAAAAUVORK5CYII=',
        filename: 'example.png'
      }
    }
    const query = {
      action: 'saveDocuments',
      'args': [ { ...docs, auth: AUTH } ]
    }

    try {
      await request(query)
      throw new Error('NON_ARRAY_DATA_SHOULD_NOT_BE_ALLOWED')
    } catch (e) {
      assert.strictEqual('Error: ERR_API_BASE: ERR_SAVE_DOCUMENTS_DATA_MUST_BE_ARRAY', e.toString())
      // Mongo Db check
      const dbProfile = await dbGetProfile()
      assert.strictEqual(dbProfile.length, 0, 'Query should not reach database')
    }
  })

  it('Function delete, can be used to delete a document sending the _id by the user', async () => {
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    await request(initialQuery)

    const query = {
      action: 'saveDocuments',
      'args': [ { ...VALID_DOCUMENTS, auth: AUTH } ]
    }
    const documents = await request(query)
    const _id = documents[0]._id

    const query2 = {
      action: 'delete',
      'args': [ { _id, auth: AUTH, collection: 'documents' } ]
    }
    await request(query2)

    const query3 = {
      action: 'fetch',
      'args': [ { auth: AUTH, collection: 'documents', amount: LIMIT, offset: OFFSET } ]
    }
    const docs = await request(query3)
    assert.strictEqual(false, docs)
  })

  it('Function delete, can be used to delete a document sending the _id and uid by an admin', async () => {
    const initialQuery = {
      action: 'saveData',
      'args': [ { ...VALID_DATA, auth: AUTH } ]
    }
    await request(initialQuery)

    const query = {
      action: 'saveDocuments',
      'args': [ { ...VALID_DOCUMENTS, auth: AUTH } ]
    }
    const documents = await request(query)
    const _id = documents[0]._id

    const query2 = {
      action: 'delete',
      'args': [ { _id, auth: ADM_AUTH, collection: 'documents', uid: UID_OF_AUTH } ]
    }
    await request(query2)

    const query3 = {
      action: 'fetch',
      'args': [ { auth: AUTH, collection: 'documents', amount: LIMIT, offset: OFFSET } ]
    }
    const docs = await request(query3)
    assert.strictEqual(false, docs)
  })
})
