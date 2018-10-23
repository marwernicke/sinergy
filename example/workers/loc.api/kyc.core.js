'use strict'

const _ = require('lodash')
const async = require('async')
const { Api } = require('bfx-wrk-api')
const ObjectID = require('mongodb').ObjectID
const {
  parsePagination,
  notInSchema,
  createVerificationEmail,
  allDataSectionStatus,
  dataIsEditableByUser,
  isStatusValidPassage,
  findByTypeAccessRestriction,
  parseFetchRequest,
  checkSectionStatus,
  parseAndAddActiveAdminsUsers,
  parseSavedData,
  parseSearchQuery,
  mongoDbLogsFilters,
  getUsdVolume,
  analytics
} = require('./helpers')

class CoreKyc extends Api {
  async saveData (space, args, cb) {
    try {
      const { auth } = args
      const data = _.omit(args, ['auth'])
      const dataUid = parseInt(data.uid) || null
      const { admin, user, uid } = await this._validateAuth(auth, dataUid)
      if (user) {
        data.core_username = user.username
        data.core_email = user.email
      }
      this._saveData(data, uid, admin, cb)
    } catch (e) {
      cb(new Error(`KYC_SAVE_DATA_ERROR: ${e.toString()}`))
    }
  }

  saveFormsData (space, args, cb) {
    try {
      const { rid, form } = args
      const data = _.omit(args, ['rid', 'form'])
      const uid = this._checkRidToken(rid)
      if (!uid) return cb(new Error('ERR_NOT_VALID_RID'))
      if (form) data[`form${form}`] = true
      else data.form = true
      this._saveData(data, uid, null, cb)
    } catch (e) {
      cb(new Error(`KYC_SAVE_DATA_ERROR: ${e.toString()}`))
    }
  }

  async saveDocuments (space, args, cb) {
    try {
      const { documents, auth } = args
      const { uid } = await this._validateAuth(auth)
      if (!_.isArray(documents)) {
        return cb(new Error('ERR_SAVE_DOCUMENTS_DATA_MUST_BE_ARRAY'))
      }
      this._saveDocs(documents, uid, cb)
    } catch (e) {
      cb(new Error(`KYC_SAVE_DOCS_ERROR: ${e.toString()}`))
    }
  }

  saveFormsDocuments (space, args, cb) {
    try {
      const { rid, form } = args
      const documents = (form)
        ? _.map(args.documents, (element) => {
          return _.extend({}, element, { form })
        })
        : args.documents
      const uid = this._checkRidToken(rid)
      if (!uid) return cb(new Error('ERR_NOT_VALID_RID'))
      if (!_.isArray(documents)) {
        return cb(new Error('ERR_SAVE_DOCUMENTS_DATA_MUST_BE_ARRAY'))
      }
      this._saveDocs(documents, uid, cb)
    } catch (e) {
      cb(new Error(`KYC_SAVE_FORMS_ERROR: ${e.toString()}`))
    }
  }

  async fetch (space, args, cb) {
    try {
      const { auth, collection } = args
      const { offset, amount } = parsePagination(args)
      const dataUid = parseInt(args.uid)

      if (!['compliances', 'documents'].includes(collection)) {
        throw new Error('KYC_ERROR_INVALID_COLLECTION_TO_FETCH')
      }
      const { admin, uid } = await this._validateAuth(auth, dataUid)
      const query = dataUid ? { uid: dataUid } : { uid }
      const res = await this._find(query, collection, amount, offset)
      const result = parseFetchRequest(res, admin, collection, this.ctx.auth_google.checkAdmAccessLevel)

      if (admin) {
        await this._addRecentlyViewedAndCheckedToMain(collection, result, admin, dataUid)
      }

      cb(null, result)
    } catch (e) {
      cb(new Error(`KYC_FIND_ERROR: ${e.toString()}`))
    }
  }

  async delete (space, args, cb) {
    try {
      const { _id, auth, collection } = args
      if (!_id) throw new Error('KYC_ERROR_MISSING_DATA_ID')
      if (!collection) throw new Error('KYC_ERROR_MISSING_DATA_COLLECTION')
      if (collection !== 'documents' && collection !== 'compliances') {
        throw new Error('KYC_ERROR_ONLY_DOCUMENTS_OR_COMPLIANCES_CAN_BE_DELETED')
      }

      const { uid, admin } = await this._validateAuth(auth, args.uid)
      if (!uid) throw new Error('KYC_ERROR_MISSING_UID')

      const query = { _id: ObjectID(_id), uid }
      const fetch = await this._find(query, collection)
      const savedData = fetch && fetch[0]

      if (!savedData) {
        throw new Error('KYC_ERROR_NO_DATA_WAS_FOUND_FOR_THE_SENDED_PARAMETERS')
      }
      if (savedData.is_main_account) {
        throw new Error('KYC_ERROR_CANT_DELETE_A_MAIN_ACCOUNT')
      }
      const mainAccountData = await this._getComplianceMainAccountDataFromUID(uid)
      dataIsEditableByUser({}, mainAccountData, admin)

      await this._delete(collection, query)
      cb()
    } catch (e) {
      cb(new Error(`KYC_DELETE_ERROR: ${e.toString()}`))
    }
  }

  async process (space, args, cb) {
    try {
      const { _id, status, notes, auth, notify } = args
      const { admin } = await this._validateAuth(auth)

      if (!admin) throw new Error('KYC_MUST_BE_ADMIN_TO_EDIT_PROCESS')
      if (!_id) throw new Error('KYC_ERROR_MISSING_DATA_ID')
      if (!status) throw new Error('KYC_ERROR_MISSING_DATA_STATUS')

      if (!['canceled', 'refused', 'unrefused'].includes(status)) {
        throw new Error('KYC_ERROR_INVALID_DATA_STATUS')
      }
      if (!notes) throw new Error('KYC_EDIT_STATUS_MUST_HAVE_NOTES')

      const query = { _id: ObjectID(_id) }
      const data = await this._find(query, 'compliances')
      if (!data) return cb(new Error('KYC_ERROR_ID_NOT_FOUND'))

      const grcBfx = this.ctx.grc_bfx
      const sendVerificationEmail = createVerificationEmail(data[0], status, grcBfx)

      isStatusValidPassage(status, data[0].status)
      const timestamp = new Date().getTime()
      switch (status) {
        case 'canceled':
          await this._cancelProcess(data[0], timestamp)
          break
        case 'refused':
          await this._refusedProcess(data[0], timestamp)
          break
        case 'unrefused':
          await this._unrefusedProcess(data[0], timestamp)
          break
      }

      await this._addChangeStatusLog(admin, status, data[0].uid, notes)

      if (notify !== false) sendVerificationEmail()

      const process = { status, timestamp }

      cb(null, { process })
    } catch (e) {
      cb(new Error(`KYC_EDIT_PROCESS_ERROR: ${e.toString()}`))
    }
  }

  async findByType (space, args, cb) {
    try {
      const { auth, search, type } = args
      const { offset, amount, order } = parsePagination(args)
      const { admin } = await this._validateAuth(auth)
      findByTypeAccessRestriction(admin, type, this.ctx.auth_google.checkAdmAccessLevel)

      const query = parseSearchQuery(search, type)
      const res = await this._find(query, 'compliances', amount, offset, order)

      const filter = this._parseFilter(res)
      const recently = (type && offset === 0) &&
        await this._addRecently(admin, query)
      cb(null, { filter, recently })
    } catch (e) {
      cb(new Error(`KYC_FIND_ERROR: ${e.toString()}`))
    }
  }

  async adminCheckEdit (space, args, cb) {
    try {
      const { auth, dataId } = args
      const { admin } = await this._validateAuth(auth)
      if (!admin) {
        return cb(new Error('ERR_KYC_MUST_BE_ADMIN_TO_CHECK_EDITION_FLAG'))
      }

      const _id = dataId
      const openQuery = {
        $and: [
          { compliances_id: _id },
          { admin: { $not: { $eq: admin } } },
          { saved_timestamp: { $exists: false } }
        ]
      }
      const saveQuery = {
        $and: [
          { compliances_id: _id },
          { saved_timestamp: { $exists: true } }
        ]
      }

      const openObj = { open_timestamp: -1 }
      const open = await this._find(openQuery, 'adminChecks', 1, 0, openObj)
      const save = await this._find(saveQuery, 'adminChecks', 1, 0, openObj)
      const check = open && open[0]
      const saved = save && save[0]
      const own = await this._addAdminTimestamp(_id, admin, 'open')
      cb(null, { _id: own, check, saved })
    } catch (e) {
      cb(new Error(`KYC_CHECK_ERROR: ${e.toString()}`))
    }
  }

  async statusLogs (space, args, cb) {
    try {
      const { auth, options = {} } = args
      const { admin } = await this._validateAuth(auth)
      if (!admin) throw new Error('KYC_MUST_BE_ADMIN_TO_FETCH_STATUS_LOGS')
      const res = await this._fetchLogs(options)
      cb(null, res)
    } catch (e) {
      cb(new Error(`KYC_STATUS_LOGS_ERROR: ${e.toString()}`))
    }
  }

  async analytics (space, args, cb) {
    try {
      const { auth, options = {} } = args
      const { admin } = await this._validateAuth(auth)
      if (!admin) throw new Error('KYC_MUST_BE_ADMIN_TO_FETCH_ANALYTICS_REPORTS')
      const res = await this._fetchAnalytics(options)
      cb(null, res)
    } catch (e) {
      cb(new Error(`KYC_STATUS_ANALYTICS_ERROR: ${e.toString()}`))
    }
  }

  async fetchAdmins (space, args, cb) {
    try {
      const { auth } = args
      const { admin } = await this._validateAuth(auth)
      if (!this.ctx.auth_google.checkAdmAccessLevel(admin, 0)) {
        throw new Error('KYC_MUST_BE_SUPER_ADMIN_TO_FETCH_ADMINS')
      }

      const res = await this._fetchAdmins()
      cb(null, res)
    } catch (e) {
      cb(new Error(`KYC_STATUS_ADM_FETCH_ERROR: ${e.toString()}`))
    }
  }

  loginAdmin (space, args, cb) {
    return this.ctx.auth_google.loginAdmin(args, cb)
  }

  async verifiedUser (space, args, cb) {
    try {
      const query = {
        $and: [
          args,
          { digital_signature_verified: { $exists: true } }
        ]
      }
      const data = await this._find(query, 'compliances')
      const result = data && data.length >= 1
      return cb(null, result)
    } catch (e) {
      return cb(new Error(`KYC_ERROR_VERIFIED: : ${e.toString()}`))
    }
  }

  async _validateAuth (auth, dataUid = null) {
    const admin = await this._checkAdmin(auth)
    const user = !admin ? await this._getUserData(auth) : null
    if (!admin && !user) throw new Error('AUTH_TOKEN_INVALID')

    const uid = user ? user.id : parseInt(dataUid) || 0
    if (uid && dataUid && uid !== dataUid) {
      throw new Error('MUST_BE_ADMIN_OR_DATA_OWNER')
    }
    return { admin, user, uid }
  }

  async _saveData (data, sendUid, admin, cb) {
    const { _id, reset, notes, notify } = data
    const { result, verifyTimestamp } = parseSavedData(data)
    try {
      const dbData = (_id)
        ? await this._getComplianceDataFromId(_id)
        : {}

      await this._verifyData(_id, result, dbData, admin, sendUid, reset, verifyTimestamp)
      const uid = sendUid || dbData.uid

      if (reset) {
        await this._resetData(_id, uid, admin, dbData, notes)
        result.status = 'incomplete'
        result.is_main_account = true
      }

      const savedData = (reset) ? {} : dbData

      const {
        addData,
        sendVerificationEmail
      } = await this._changeDataStatus(_id, uid, result, savedData)

      const status = addData && addData.status
      const err = status &&
        admin &&
        !notes &&
        !['incomplete', 'submitted', 'verified'].includes(status)
      if (err) throw new Error('KYC_EDIT_STATUS_MUST_HAVE_NOTES')

      const update = { $set: _.assign({}, result, addData, { uid }) }
      const newId = await this._update('compliances', { _id: ObjectID(_id) }, update)

      if (status) await this._addChangeStatusLog(admin, status, uid, notes)
      if (admin) await this._addAdminTimestamp(_id, admin, 'save')

      if (sendVerificationEmail && notify !== false) sendVerificationEmail()
      const { timestamp } = result
      const showData = _.omit(addData, ['summary', 'checked_by_admin', 'uid', 'notes'])
      const res = { ...showData, timestamp }
      if (newId) res._id = newId

      return cb(null, res)
    } catch (e) {
      return cb(e)
    }
  }

  async _resetData (_id, uid, admin, savedData, notes) {
    if (!_id) throw new Error('KYC_ERROR_CANT_RESET_WITHOUT_SENDING_THE_DATA_ID')
    if (savedData.digital_signature_submitted) {
      throw new Error('KYC_ERROR_CANT_RESET_IF_DATA_HAS_BEEN_SUBMITTED')
    }
    if (!savedData.is_main_account) {
      throw new Error('KYC_ERROR_CANT_RESET_FROM_A_MEMBER_ACCOUNT')
    }
    await this._delete('documents', { uid })
    await this._delete('compliances', { uid })

    await this._addChangeStatusLog(admin, 'reset', uid, notes)
  }

  async _getComplianceDataFromId (_id) {
    const query = { _id: ObjectID(_id) }
    const data = await this._find(query, 'compliances')
    if (!data) throw new Error('KYC_ERROR_AT_STATE_VERIFICATION')
    return data[0]
  }

  async _getComplianceMainAccountDataFromUID (uid) {
    const query = {
      $and: [
        { is_main_account: true },
        { uid }
      ]
    }
    const data = await this._find(query, 'compliances')
    return data && data[0]
  }

  async _checkIsUniqueMainAccount (uid) {
    const query = {
      $and: [
        { is_main_account: true },
        { uid }
      ]
    }
    const data = await this._find(query, 'compliances')
    if (data) throw new Error('NOT_TWO_MAIN_ACCOUNTS_ADMITTED_FOR_THE_SAME_UID')
    return !data
  }

  async _changeDataStatus (_id, uid, newData, savedData) {
    const isSubmitted = savedData.digital_signature_submitted
    const sections = (!isSubmitted)
      ? await this._checkSectionStatusSubmitted(uid, newData, savedData)
      : await this._autoVerifiedSectionStatus(uid, newData, savedData)

    const {
      extraData,
      sendVerificationEmail
    } = await this._checkAndChangeStatus(_id, uid, newData, savedData, sections)
    const addData = _.assign({}, extraData, sections)

    return { addData, sendVerificationEmail }
  }

  async _checkAndChangeStatus (_id, uid, newData, savedData, sections) {
    const mixData = _.assign({}, savedData, newData, sections)
    const newStatus = newData.status || null

    const isMainAccount = mixData.is_main_account
    if (!isMainAccount) {
      if (newStatus) throw new Error('KYC_CANT_SET_STATUS_TO_A_MEMBER')
      return {}
    }

    if (!_id && isMainAccount) {
      return this._newMainAccount(mixData, sections)
    }

    switch (newStatus) {
      case 'canceled':
      case 'incomplete':
      case 'resumed':
        return this._cancelOrIncompleteState(_id, newData, savedData, uid)
      case 'submitted':
        return this._submittedState(mixData, sections, uid)
      case 'pending':
        return this._pendingState(mixData)
      case null:
        return this._verifiedState(mixData)
      default:
        throw new Error(`KYC_STATUS_${newStatus}_IS_NOT_A_VALID_OPTION`)
    }
  }

  async _newMainAccount (data, sections) {
    const status = 'incomplete'
    return {
      extraData: {
        status,
        core_username: data.core_username,
        core_email: data.core_email,
        ...sections
      }
    }
  }
  async _cancelOrIncompleteState (_id, newData, savedData, uid) {
    const newStatus = (newData.status === 'resumed')
      ? 'incomplete'
      : newData.status
    const oldStatus = savedData.status
    isStatusValidPassage(newStatus, oldStatus)

    if (savedData.digital_signature_submitted) {
      const err = await this._checkVerificationStarted(savedData, uid)
      if (err) throw new Error('KYC_ERROR_CANT_CANCELED_AS_VERIFICATION_PROCESS_STARTED')
      const remove = { $unset: { digital_signature_submitted: '' } }
      await this._update('compliances', { _id: ObjectID(_id) }, remove)
    }
    const sections = (newStatus === 'incomplete')
      ? await this._checkSectionStatusSubmitted(uid, newData, savedData)
      : {}
    if (newData.status === 'resumed') sections.kyc_section_status = 1 // Used as flag kyc doc has been sent
    return { extraData: { status: newStatus, ...sections } }
  }

  async _submittedState (data, newSectionStatus, uid) {
    const type = data.type_account
    const completeData = _.assign({}, data, newSectionStatus)
    const isComplete = _.isMatch(completeData, allDataSectionStatus(1, type))
    if (!isComplete) throw new Error('KYC_ERROR_DATA_IS_MISSING_CANT_BE_SUBMITTED')
    const summary = await this._getSummary(uid)
    return this._verificationProcess(data, 'submitted', summary)
  }

  _verifiedState (data) {
    const type = data.type_account
    const isSubmitted = data.digital_signature_submitted
    const isVerified = data.digital_signature_verified

    const isVerifiable = isSubmitted &&
      !isVerified &&
      _.isMatch(data, allDataSectionStatus(2, type))
    return (isVerifiable)
      ? this._verificationProcess(data, 'verified')
      : {}
  }

  _pendingState (data) {
    return { extraData: {
      digital_signature_pending: new Date().getTime(),
      status: 'pending' }
    }
  }

  async _fetchLogs (params) {
    const { unique } = params
    const { offset, amount } = parsePagination(params)

    const andQuery = mongoDbLogsFilters(params)
    const query = (unique)
      ? [
        {
          $match: andQuery
        },
        {
          $group: {
            _id: '$uid',
            actor: { $last: '$actor' },
            status: { $last: '$status' },
            notes: { $last: '$notes' },
            net_worth_usd: { $last: '$net_worth_usd' },
            timestamp: { $last: '$timestamp' }
          }
        }
      ]
      : andQuery

    const find = (unique)
      ? await this._aggregate(query, 'statusLogs', amount, offset)
      : await this._find(query, 'statusLogs', amount, offset)

    const map = (find)
      ? _.map(find, d => _.pick(d, ['actor', 'status', 'net_worth_usd', 'notes', 'timestamp']))
      : []

    return map
  }

  async _fetchAnalytics (params) {
    const {
      type,
      precision
    } = params
    const parsePrecision = precision || 0.95

    if (parsePrecision < 0.10 || parsePrecision > 1) {
      throw new Error('KYC_ERROR_PRECISION_SHOULD_BE_GREATER_THAN_0.10_AND_SMALLER_THAN_1')
    }

    const fetch = (type, parsePrecision, params) => {
      const andQuery = mongoDbLogsFilters(params)

      switch (type) {
        case 'general':
          return this._fetchGeneralAnalytics(andQuery, parsePrecision)
        case 'admin':
          return this._fetchAdminAnalytics(andQuery, parsePrecision)
        case 'stats':
          return this._fetchStatsAnalytics(andQuery, params)
        default:
          throw new Error('KYC_ERROR_POSSIBLE_TYPES_OF_ANALYTICS')
      }
    }

    const res = await fetch(type, parsePrecision, params)

    return res
  }

  async _fetchGeneralAnalytics (andQuery, precision) {
    const triggerQ = analytics.generalTrigger(andQuery)
    const triggerRes = await this._aggregate(triggerQ, 'statusLogs')
    const trigger = _.map(triggerRes, d => _.pick(d, ['status', 'amount']))

    const finalStatusQ = analytics.generalFinalStatus(andQuery)
    const finalStatusRes = await this._aggregate(finalStatusQ, 'statusLogs')
    const finalStatus = _.map(finalStatusRes, d => _.pick(d, ['status', 'amount']))

    const averagesKeys = ['submitted', 'verified']
    const averages = await this._createAverages(
      finalStatusRes,
      averagesKeys,
      andQuery,
      precision
    )

    return { trigger, finalStatus, averages }
  }

  async _createAverages (values, averagesKeys, andQuery, precision) {
    const averages = []
    for (const op in values) {
      const value = values[op]
      if (averagesKeys.includes(value.status)) {
        const possiblesUid = analytics.getPossibleUidForGeneral(value.arr)
        const firstQ = analytics.getFirstDates(andQuery, value.status, possiblesUid)
        const firstRes = await this._aggregate(firstQ, 'statusLogs')
        const res = analytics.getAverage(firstRes, value.arr, precision)
        const base = { status: value.status, ...res }
        averages.push(base)
      }
    }
    return averages
  }

  async _fetchAdminAnalytics (andQuery, precision) {
    const triggerQ = analytics.adminTrigger(andQuery)
    const triggerRes = await this._aggregate(triggerQ, 'statusLogs')
    const trigger = analytics.mapAdminTrigger(triggerRes)

    const possiblesUid = analytics.getPossibleUidForAdmin(triggerRes, 'verified')
    const firstQ = analytics.getFirstDates(andQuery, 'verified', possiblesUid)
    const firstRes = await this._aggregate(firstQ, 'statusLogs')
    const averages = analytics.getAdminsAverages(
      triggerRes,
      firstRes,
      precision
    )

    return { trigger, averages }
  }

  async _fetchAdmins () {
    const query = [
      {
        $group: {
          _id: '$actor',
          user: { $last: '$actor' },
          logs: { $sum: 1 },
          last_log: { $last: '$timestamp' }
        }
      }
    ]
    const { ADM_USERS } = this.ctx.auth_google.conf

    const find = await this._aggregate(query, 'statusLogs')
    const admins = await parseAndAddActiveAdminsUsers(find, ADM_USERS)

    return admins
  }

  async _fetchStatsAnalytics (andQuery, params) {
    const { timeFrame = 'month' } = params

    const triggerQ = analytics.generalTrigger(andQuery, timeFrame)
    const triggerRes = await this._aggregate(triggerQ, 'statusLogs')
    const trigger = analytics.statsTransform(triggerRes)

    const finalStatusQ = analytics.generalFinalStatus(andQuery, timeFrame)
    const finalStatusRes = await this._aggregate(finalStatusQ, 'statusLogs')
    const finalStatus = analytics.statsTransform(finalStatusRes)

    return { trigger, finalStatus }
  }

  async _checkSectionStatusSubmitted (uid, newData, savedData) {
    const data = _.assign({}, savedData, newData)
    const type = data.type_account
    const isCorporate = type === 'corporate'
    const isMainAccount = data.is_main_account

    const members = isCorporate &&
      isMainAccount &&
      await this._fetchCorporateMembers(uid)

    return checkSectionStatus(data, members)
  }

  async _autoVerifiedSectionStatus (uid, newData, savedData) {
    const data = _.assign({}, savedData, newData)
    const isCorporate = data.type_account === 'corporate'
    const isSubmitted = data.digital_signature_submitted
    const isVerified = data.digital_signature_verified
    const isMainAccount = data.is_main_account
    const isNotAutoVerifiableStatus = !isCorporate ||
      !isSubmitted ||
      isVerified ||
      !isMainAccount
    if (isNotAutoVerifiableStatus) return {}

    const allMembersSectionsVerified = (member) => {
      return member.contact_section_status === 2 &&
        member.address_section_status === 2 &&
        member.identity_section_status === 2
    }
    const members = await this._fetchCorporateMembers(uid)
    const membersChecked = members && members.length && members.every(allMembersSectionsVerified)
    return (membersChecked)
      ? { identity_section_status: 2 }
      : { identity_section_status: 1 }
  }

  _fetchCorporateMembers (uid) {
    const query = {
      $and: [
        {
          $or: [
            { is_main_account: { $exists: false } },
            { is_main_account: false }
          ]
        },
        { uid }
      ]
    }
    return this._find(query, 'compliances')
  }

  async _verificationProcess (data, status, summary = null) {
    const extraData = (status === 'verified')
      ? { digital_signature_verified: new Date().getTime(), status }
      : {
        digital_signature_submitted: new Date().getTime(),
        status,
        summary,
        checked_by_admin: false
      }

    const grcBfx = this.ctx.grc_bfx
    const sendVerificationEmail = createVerificationEmail(data, status, grcBfx)

    return { extraData, sendVerificationEmail }
  }

  async _checkVerificationStarted (usersData, uid) {
    const sections = [
      'kyc_section_status',
      'contact_section_status',
      'address_section_status',
      'corporate_section_status',
      'identity_section_status',
      'financial_section_status'
    ]
    const isCorporate = usersData.type_account === 'corporate'
    const members = (isCorporate) ? await this._fetchCorporateMembers(uid) : []
    const allUsers = [...members, usersData]
    let err = false
    _.forEach(allUsers, user => {
      if (err) return false
      _.forIn(user, (value, key) => {
        const ceckStatus = (_.indexOf(sections, key) !== -1 && value === 2)
        if (ceckStatus) {
          err = true
          return false
        }
      })
    })
    return err
  }

  async _cancelProcess (data, timestamp) {
    const canceled = allDataSectionStatus(0, data.type_account)
    canceled.status = 'canceled'
    canceled.digital_signature_canceled = new Date().getTime()
    canceled.timestamp = timestamp

    const update = { $set: canceled }
    await this._update('compliances', { _id: ObjectID(data._id) }, update)
    const remove = { $unset: { digital_signature_submitted: '' } }
    await this._update('compliances', { _id: ObjectID(data._id) }, remove)
  }

  async _refusedProcess (data, timestamp) {
    const refused = allDataSectionStatus(3, data.type_account)
    refused.status = 'refused'
    refused.digital_signature_refused = new Date().getTime()
    refused.timestamp = timestamp

    const update = { $set: refused }
    await this._update('compliances', { _id: ObjectID(data._id) }, update)
  }

  async _unrefusedProcess (data, timestamp) {
    const unrefused = allDataSectionStatus(1, data.type_account)
    unrefused.status = 'submitted'
    unrefused.timestamp = timestamp

    const update = { $set: unrefused }
    await this._update('compliances', { _id: ObjectID(data._id) }, update)
  }

  _parseFilter (data) {
    return _.map(data, d => _.pick(d, ['uid', 'remark', '_id',
      'core_email', 'core_username', 'status', 'summary',
      'resid_country', 'first_name', 'last_name', 'language',
      'type_account', 'checked_by_admin', 'net_worth_usd',
      'timestamp', 'is_main_account']))
  }

  _saveDocs (documents, uid, cb) {
    async.parallel(_.transform(documents, (result, doc) => {
      result.push((callback) => { this._parseSaveDoc(callback, doc, uid) })
    }, []), (err, results) => {
      if (err) return cb(err)
      this._saveDocsDb(cb, results)
    })
  }

  _parseSaveDoc (cb, doc, uid) {
    if (uid && doc.uid && doc.uid !== uid) {
      cb(new Error('MUST_BE_ADMIN_OR_DATA_OWNER_TO_SAVE_THIS_DOC'))
    }
    if (doc.data) {
      const docUid = uid || doc.uid
      return (docUid)
        ? this._uploadS3(doc, docUid, cb)
        : cb(new Error('API_ERROR_UPLOADED_NO_UID'))
    }
    if (doc._id) {
      const { _id } = doc
      const d = _.pick(doc,
        [
          'url',
          'key',
          'uid',
          'account_id',
          'filename',
          'type',
          'form',
          'remark',
          'is_private'
        ]
      )
      d.timestamp = Date.now()
      return cb(null, { _id, d })
    } else {
      return cb(new Error('API_ERROR_UPLOADED_NO_FILE_OR_ID'))
    }
  }

  async _uploadS3 (doc, uid, cb) {
    const { _id, filename } = doc
    const key = await this._searchForS3Key(_id)

    this.ctx.grc_s3.uploadS3(doc.data, filename, key,
      (err, data) => {
        if (err) return cb(err)

        const timestamp = Date.now()
        const pickedDoc = _.pick(doc, [
          'filename', 'type', 'form', 'remark', 'form', 'account_id', 'is_private'
        ])
        const d = {
          url: data.public_url,
          key: data.key,
          uid,
          timestamp,
          ...pickedDoc
        }

        return cb(null, { _id, d })
      }
    )
  }

  _saveDocsDb (cb, docs) {
    const mc = this.ctx.dbMongo_m0.db
    const bulk = mc.collection('documents').initializeOrderedBulkOp()
    const updateIds = []
    _.forEach(docs, (doc) => {
      const { _id, d } = doc
      if (_id) updateIds.push(_id)
      const update = {
        $set: d
      }
      bulk.find({ _id: ObjectID(_id) })
        .upsert()
        .updateOne(update)
    })

    bulk.execute((err, result = {}) => {
      if (err) throw new Error(err)

      const { getUpsertedIds = () => [] } = result
      const upserts = getUpsertedIds()
      const upsertIds = this._parseUpserts(upserts)
      const ids = _.union(upsertIds, updateIds)

      const data = _.reduce(ids, (res, val, i) => {
        const { url, timestamp } = docs[i].d
        res.push({ url, _id: val, timestamp })
        return res
      }, [])

      cb(null, data)
    })
  }

  async _searchForS3Key (_id) {
    if (!_id) return null
    try {
      const doc = await this._find({ _id: ObjectID(_id) }, 'documents')
      return !!doc && !!doc.length && doc[0].key
    } catch (e) {
      return null
    }
  }

  _addAdminTimestamp (_id, admin, type) {
    const query = {
      $and: [
        { compliances_id: _id },
        { admin: admin },
        { saved_timestamp: { $exists: false } }
      ]
    }
    const compliances = { compliances_id: _id, admin: admin }
    if (type === 'save') {
      compliances.saved_timestamp = new Date().getTime()
    } else {
      compliances.open_timestamp = new Date().getTime()
    }
    const update = {
      $set: compliances
    }
    return this._update('adminChecks', query, update)
  }

  async _addRecently (admin, query) {
    try {
      const recentlyUids = await this._find(
        { admin }, 'recentlies', 25, 0, { timestamp: -1 }
      )
      const recentlyQuery = _.reduce(recentlyUids, (acc, val, index) => {
        acc.push({ uid: val.uid, status: query.status })
        return acc
      }, [])
      const recently = !!recentlyQuery.length &&
        this._parseFilter(
          await this._find(
            { $or: recentlyQuery }, 'compliances', 25, 0, { timestamp: -1 }
          )
        )
      return recently
    } catch (e) {
      throw new Error('ERR_KYC_ADD_RECENTLY')
    }
  }

  async _addRecentlyViewedAndCheckedToMain (collection, result, admin, uid) {
    if (collection === 'compliances' && result && result.length) {
      for (let i = 0; i < result.length; i++) {
        const d = result[i]
        if (d.is_main_account) {
          if (d.digital_signature_submitted && d.checked_by_admin === false) {
            const query = { _id: ObjectID(d._id) }
            const update = { $set: { checked_by_admin: true } }
            await this._update('compliances', query, update)
          }
          return this._addRecentlyViewed(admin, uid, d)
        }
      }
    }
    return true
  }

  _addRecentlyViewed (admin, uid, data) {
    const query = { _id: ObjectID(data._id) }
    const update = { uid, admin, timestamp: Date.now() }
    return this._update('recentlies', query, update)
  }

  _update (collection, query, update) {
    const ctx = this.ctx
    const mc = ctx.dbMongo_m0.db
    return new Promise((resolve, reject) => {
      mc.collection(collection).update(
        query, update, { upsert: true }, (err, res) => {
          if (err) return reject(err)
          const { upserted = [] } = res.result
          const ids = this._parseUpserts(upserted)
          return (ids.length) ? resolve(ids[0]) : resolve()
        })
    })
  }

  _find (query, collection, limit = 0, skip = 0, sort = { $natural: 1 }) {
    const ctx = this.ctx
    const mc = ctx.dbMongo_m0.db
    return new Promise((resolve, reject) => {
      mc.collection(collection).find(
        query
      ).limit(limit).skip(skip)
        .sort(sort).toArray((err, res) => {
          if (err) return reject(err)
          resolve(!!res && !!res[0] && res)
        })
    })
  }

  _aggregate (query, collection, limit = 0, skip = 0) {
    const ctx = this.ctx
    const mc = ctx.dbMongo_m0.db
    const start = mc.collection(collection).aggregate(query)
    const search = (limit > 0)
      ? start.limit(limit).skip(skip)
      : start
    return new Promise((resolve, reject) => {
      search.toArray((err, res) => {
        if (err) return reject(err)
        resolve(!!res && !!res[0] && res)
      })
    })
  }

  _delete (collection, query) {
    const ctx = this.ctx
    const mc = ctx.dbMongo_m0.db

    return new Promise((resolve, reject) => {
      mc.collection(collection).deleteMany(
        query, (err) => {
          if (err) return reject(err)
          resolve()
        }
      )
    })
  }

  _parseUpserts (upserts = []) {
    return _.reduce(upserts, (acc, val) => {
      acc.push(val._id)
      return acc
    }, [])
  }

  async _verifyData (_id, data, saveData, admin, uid, reset, verifyTimestamp) {
    if (!(saveData.uid || uid)) throw new Error('KYC_ADMINS_CANT_CREATE_AN_ACCOUNT')
    if (saveData.uid && uid && saveData.uid !== uid) throw new Error('KYC_USER_CANT_EDIT_OTHER_USERS_DATA')

    const badKeyValue = notInSchema(data)
    if (badKeyValue) throw new Error(`KYC_DATA_TYPE_${badKeyValue}_NOT_IN_SCHEMA`)

    if (verifyTimestamp && verifyTimestamp !== saveData.timestamp) {
      throw new Error('KYC_DATA_HAD_BEEN_MODIFIED_FROM_THE_verification_timestamp_SEND')
    }

    if (!_id && data.is_main_account && !reset) await this._checkIsUniqueMainAccount(uid)

    const mainAccountData = (data.is_main_account || saveData.is_main_account)
      ? saveData
      : await this._getComplianceMainAccountDataFromUID(uid || saveData.uid)
    return dataIsEditableByUser(data, mainAccountData, admin)
  }

  _getUserData (authToken) {
    return new Promise(async (resolve, reject) => {
      this.ctx.grc_bfx.req(
        'rest:core:user',
        'checkAuthToken',
        authToken,
        { timeout: 10000 },
        (err, data) => {
          if (err) return reject(err)
          return resolve(data)
        })
    })
  }

  _getSummary (uid) {
    return new Promise(async (resolve, reject) => {
      this.ctx.grc_bfx.req(
        'rest:core:user',
        'getSummary',
        [ uid, '30d' ],
        { timeout: 10000 },
        (err, data) => {
          if (err) return reject(err)
          return resolve(data)
        })
    })
  }

  async _getUserID (authToken) {
    const seemsAdmin = this.ctx.auth_google.preAdminTokenCheck(authToken)
    if (seemsAdmin) return 0
    const user = await this._getUserData(authToken)
    if (user.id) return user.id
    else throw new Error('INVALID_USER_TOKEN')
  }

  async _checkAdmin (authToken) {
    const preCheck = this.ctx.auth_google.preAdminTokenCheck(authToken)
    if (!preCheck) return false
    const token = authToken[0]
    const ip = authToken[1].ip
    const search = await this._find({ token, ip }, 'adminTokens')
    return !!search && !!search.length && search[0].username
  }

  async _addChangeStatusLog (admin, status, uid, notes = null) {
    const actor = admin || 'user'
    const date = new Date()
    const timestamp = date.getTime()
    const summary = await this._getSummary(uid)
    const worth = getUsdVolume(summary)

    const update = {
      actor,
      status,
      uid,
      notes,
      date,
      net_worth_usd: worth,
      timestamp
    }

    const check = { _id: ObjectID() }
    return this._update('statusLogs', check, update)
  }

  // test function for quick forms.
  // TOOD: need working rids from bfx backend
  _checkRidToken (rid) {
    switch (rid) {
      case 'fewlkjfew--2fwffewfewfw-fewfew':
        return 14673331
      default:
        return false
    }
  }
}

module.exports = CoreKyc
