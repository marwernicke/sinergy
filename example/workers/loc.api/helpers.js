'use strict'
const _ = require('lodash')
const { schema, requiredFields } = require('./schema')
const analytics = require('./helpers/analytics')

const lazySchema = _.reduce(schema, (acc, value) =>
  ({ ...acc, ..._.reduce(value, (acc, v) => ({ ...acc, [v]: 1 }), {}) }), {})

function parsePagination (args) {
  const offset = _.parseInt(args.offset) || 0
  const amount = _.parseInt(args.amount) || 25
  const direction = _.parseInt(args.direction) || 1
  const order = (args.order)
    ? { [args.order]: direction }
    : { $natural: 1 }
  return { offset, amount, order }
}

function notInSchema (data) {
  let badKeyValue = false
  _.forEach(data, (value, key) => {
    if (!lazySchema[key] && !_.includes(key, 'form')) {
      badKeyValue = key
      return false
    }
  })
  if (data.status && !badKeyValue) {
    const statusToCheck = [
      'incomplete',
      'submitted',
      'canceled',
      'resumed',
      'reset',
      'verified',
      'pending',
      'refused',
      'unrefused'
    ]
    const err = _.indexOf(statusToCheck, data.status) === -1
    if (err) badKeyValue = `status = ${data.status}`
  }
  return badKeyValue
}

function adminStatusRequired (data) {
  if (data.status) {
    const statusToCheck = [
      'verified',
      'pending',
      'refused',
      'unrefused'
    ]
    const ceckStatus = _.indexOf(statusToCheck, data.status) !== -1
    if (ceckStatus) return true
  }

  const ONLY_ADMIN_KEYS = schema.ONLY_ADMIN_KEYS
  const STATUS_2_KEYS = schema.ONLY_ADMIN_SET_STATUS_2_KEYS
  let adm = false
  _.forIn(data, (value, key) => {
    const ceckStatus = _.indexOf(ONLY_ADMIN_KEYS, key) !== -1 ||
      (_.indexOf(STATUS_2_KEYS, key) !== -1 && value === 2)
    if (ceckStatus) {
      adm = true
      return false
    }
  })
  return adm
}

function createVerificationEmail (data, type, grcBfx) {
  const text = `${data.core_username}, your verification form has been ${type}.`
  const to = data.core_email
  const from = 'compliances@bitfinex.com'
  const subject = `Bitfinex Compliance Information ${type}`
  const email = { to, from, subject, text }
  const sendVerificationEmail = () => {
    sendEmails(email, grcBfx)
  }
  return sendVerificationEmail
}

function sendEmails (msg, grcBfx) {
  const timeout = 10000
  grcBfx.req('rest:ext:sendgrid', 'sendEmail', [ msg ], { timeout },
    (err, data) => {
      if (err) {
        const eMsg = `Error sending email to ${msg.to}, subject:${msg.subject}`
        console.log(eMsg, err.toString())
      } else console.log(`Email sent to ${msg.to}, subject:${msg.subject}`)
    }
  )
}

function allDataSectionStatus (val, type) {
  const main = {
    kyc_section_status: val,
    contact_section_status: val,
    address_section_status: val,
    identity_section_status: val,
    financial_section_status: val
  }
  return (type === 'corporate')
    ? { ...main, corporate_section_status: val }
    : main
}

function dataIsEditableByUser (data, mainAccountData, admin) {
  if (!mainAccountData) throw new Error('KYC_NO_MAIN_ACCOUNT_FOUNDED')
  if (!admin && adminStatusRequired(data)) {
    throw new Error('KYC_MUST_BE_ADMIN_TO_CHANGE_THIS_DATA')
  }
  if (
    !admin &&
    mainAccountData.digital_signature_submitted &&
    data.status !== 'canceled' &&
    mainAccountData.status !== 'pending' &&
    dontBelongsToASpecialForm(data)
  ) throw new Error('KYC_ERROR_CANT_EDIT_SUBMITTED_DATA_ONLY_CANCEL')
  if (
    mainAccountData.status === 'canceled' &&
    data.status !== 'incomplete' &&
    data.status !== 'resumed'
  ) throw new Error('KYC_ERROR_CANT_EDIT_CANCELED_DATA_ONLY_RESUMED')
  if (
    mainAccountData.status === 'refused'
  ) throw new Error('KYC_ERROR_CANT_EDIT_REFUSED_DATA_ONLY_UNREFUSED_THROUGH_PROCESS')
  isStatusValidPassage(data.status, mainAccountData.status)
  return true
}

function dontBelongsToASpecialForm (data) {
  const form = _.pickBy(data, (value, key) => {
    return key.startsWith('form')
  })
  return _.isEqual(form, {})
}

function parseFetchRequest (data, admin, collection, checkAdmAccessLevel) {
  if (!data && !data.length) return false
  if (!admin) {
    return (collection === 'compliances')
      ? _.map(data, r => _.omit(r, ['uid', 'summary', 'is_monitored', 'checked_by_admin']))
      : _.map(_.filter(data, (d) => { return !d.is_private }), r => _.omit(r, ['uid']))
  }
  const fullAccess = checkAdmAccessLevel(admin, 0)
  return (fullAccess)
    ? data
    : _.map(data, r => _.omit(r, ['is_monitored']))
}

function isStatusValidPassage (newStatus, oldStatus) {
  let valid = true
  switch (newStatus) {
    case 'refused':
    case 'canceled':
      valid = ['submitted', 'pending'].includes(oldStatus)
      break
    case 'incomplete':
      valid = ['canceled', undefined].includes(oldStatus)
      break
    case 'submitted':
      valid = ['incomplete', 'refused', 'unrefused', undefined].includes(oldStatus)
      break
    case 'pending':
      valid = ['submitted'].includes(oldStatus)
      break
    case 'unrefused':
      valid = oldStatus === 'refused'
      break
    case 'resumed':
      valid = oldStatus === 'canceled'
      break
  }
  if (!valid) throw new Error(`KYC_ERROR_CANT_SET_STATUS_${newStatus}_FROM_${oldStatus}`)
}

function findByTypeAccessRestriction (admin, type, checkAdmAccessLevel) {
  if (!admin) throw new Error('ERR_KYC_MUST_BE_ADMIN_TO_FIND_BY_QUERY')
  if (
    (type !== 'pending' && !checkAdmAccessLevel(admin, 1)) ||
    (type === 'enhanced' && !checkAdmAccessLevel(admin, 0))
  ) {
    throw new Error('ERR_KYC_RESTRICTED_ACCESS')
  }
  return true
}

function checkSectionStatus (data, members) {
  const d = {}
  const corp = data.type_account === 'corporate'
  const sections = ['contact_section_status', 'address_section_status',
    'identity_section_status', 'financial_section_status', 'corporate_section_status']
  for (const s in sections) {
    if (checkSection(data, sections[s], corp, members)) d[sections[s]] = 1
    else if (
      corp &&
      sections[s] === 'identity_section_status'
    ) d[sections[s]] = 0
  }
  return d
}

function checkSection (data, section, corp, members) {
  if (data[section] &&
    !(section === 'identity_section_status' && corp && data.is_main_account)
  ) return false
  const extra = (corp)
    ? requiredFields[section]['corp']
    : requiredFields[section]['indiv']
  const keys = [...requiredFields[section]['general'], ...extra]
  if (!_checkIdentitySection(data, section, corp, members)) return false
  return keys.every(k => k in data)
}

function _checkIdentitySection (data, section, corp, members) {
  if (section !== 'identity_section_status') return true
  return (corp)
    ? _checkCorporateIdentity(data, section, members)
    : _checkIndividualIdentity(data, section)
}

function _checkIndividualIdentity (data, section) {
  const documents = requiredFields.identity_section_status_2_opts_required
  let count = 0
  for (const doc in documents) {
    if (documents[doc].every(k => k in data)) count++
  }
  return count > 1
}

function _checkCorporateIdentity (data, section, members) {
  const allSectionsSubmitted = (member) => {
    return member.contact_section_status === 1 &&
      member.address_section_status === 1 &&
      member.identity_section_status === 1
  }
  return members && members.length && members.every(allSectionsSubmitted)
}

function parseAndAddActiveAdminsUsers (admins, ADM_USERS) {
  const result = []
  const activeAdmins = _.map(ADM_USERS, 'email')
  _.forEach(admins, admin => {
    if (admin.user !== 'user') {
      const adm = _.pick(admin, ['user', 'logs', 'last_log'])
      const index = activeAdmins.indexOf(admin.user)
      adm.active = index > -1
      if (index > -1) activeAdmins.splice(index, 1)
      result.push(adm)
    }
  })
  _.forEach(activeAdmins, user => {
    const adm = {
      user,
      logs: 0,
      last_log: null,
      active: true
    }
    result.push(adm)
  })
  return _.sortBy(result, ['user'])
}

function parseSavedData (data) {
  const result = {
    ..._.omit(data, ['_id',
      'reset',
      'uid',
      'notes',
      'notify',
      'verification_timestamp']),
    timestamp: Date.now()
  }
  const verifyTimestamp = data.verification_timestamp
  return { result, verifyTimestamp }
}

function parseSearchQuery (input, type) {
  const orArr = (str) => {
    const hasQuotes = str.length > 3 &&
     str[0] === str[str.length - 1] &&
     str[0] === '"'
    return (hasQuotes)
      ? _searchQuotes(str)
      : _searchAll(str)
  }
  const search = input && input.trim()
  const searchQ = (search && search.length > 0)
    ? { $or: orArr(search) }
    : undefined

  const query = (type === 'enhanced')
    ? { is_monitored: true, ...searchQ }
    : type ? { status: type, ...searchQ } : searchQ
  return query
}
function _searchQuotes (search) {
  const s = search.replace(/"/g, '').trim()
  const names = _allNamesCombination(s)
  const rest = [
    { core_username: s },
    { core_email: s },
    { full_corporate_name: s },
    { uid: !isNaN(s) && parseInt(s, 10) }
  ]
  return (names) ? [..._.uniqWith(names, _.isEqual), ...rest] : rest
}

function _allNamesCombination (search) {
  const arr = search.split(' ')
  if (arr.length === 0) return false
  return _allCombinations(arr)
}

function _allCombinations (f = [], m = [], l = []) {
  let arr = []
  if (f.length) {
    const fClone = f.slice(0)
    const s = fClone.pop()
    arr = [...arr, ..._allCombinations(fClone, [s, ...m], l)]
    if (m.length === 0) arr = [...arr, ..._allCombinations(fClone, [], [s, ...l])]
  }
  if (m.length) {
    const mClone = m.slice(0)
    const s = mClone.pop()
    arr = [...arr, ...(_allCombinations(f, mClone, [s, ...l]))]
  }
  const opts = []
  if (f.length) opts.push({ first_name: f.join(' ') })
  if (m.length) opts.push({ middle_name: m.join(' ') })
  if (l.length) opts.push({ last_name: l.join(' ') })
  const add = (opts.length === 1) ? opts[0] : { $and: opts }
  return [add, ...arr]
}

function _searchAll (search) {
  return _.reduce(search.split(' '), (acc, s) => {
    const regS = { $regex: new RegExp('^' + s, 'i') }
    const arr = [
      { core_username: regS },
      { core_email: regS },
      { middle_name: regS },
      { first_name: regS },
      { last_name: regS },
      { full_corporate_name: regS },
      { uid: !isNaN(s) && parseInt(s, 10) }
    ]
    const newAcc = _.concat(acc, arr)
    return newAcc
  }, [])
}

function mongoDbLogsFilters (params) {
  const { start, end } = params
  const { maxWorth, minWorth } = params
  const filters = ['uid', 'status', 'actor']

  const and = _.reduce(params, (result, value, key) => {
    if (filters.includes(key)) {
      let obj = {}
      if (Array.isArray(value)) obj[key] = { $in: value }
      else obj[key] = value
      result.push(obj)
    }
    return result
  }, [])

  if (maxWorth || minWorth) {
    const worth = {}
    if (minWorth) worth['$gte'] = minWorth
    if (maxWorth) worth['$lt'] = maxWorth
    and.push({ net_worth_usd: worth })
  }

  if (start || end) {
    const timestamp = {}
    if (start) timestamp['$gte'] = new Date(start).getTime()
    if (end) timestamp['$lt'] = new Date(end).getTime()
    and.push({ timestamp })
  }
  return (and && and.length) ? { $and: and } : {}
}

function getUsdVolume (summary) {
  const vol = summary && summary.trade_vol_30d
  const val = _.isArray(vol) && _.sumBy(vol, (ob) => {
    return (ob.curr === 'Total (USD)') ? parseInt(ob.vol) : 0
  })
  return val || 0
}

module.exports = {
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
  analytics,
  getUsdVolume
}
