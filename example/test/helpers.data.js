/* eslint-env mocha */
'use strict'

const { requiredFields } = require('../workers/loc.api/schema')

// AUTH & RID should be the same user
const AUTH = ['BIX', { ip: '188.25.20.91' }]
const UID_OF_AUTH = 14673331
const RID = 'fewlkjfew--2fwffewfewfw-fewfew'
// Adm test users
const logADM = (nro) => {
  return { username: `adm${nro}@bitfinex.com`, password: 'example123' }
}
const logQuery = (user) => {
  const ip = '127.0.0.0'
  return {
    action: 'loginAdmin',
    'args': [{ user, ip }]
  }
}
const parseAdminAuth = (tkn) => {
  return [tkn, { ip: '127.0.0.0' }]
}
// Data for testing
const VALID_DATA = { first_name: 'Brent', last_name: 'Kirkland', type_account: 'individual', is_main_account: true }
const VALID_DOCUMENTS = {
  documents: [{
    type: 'passport',
    data: 'data:image/png;base64,iVBORw0KGgoAAAAUVORK5CYII=',
    filename: 'example.png',
    account_id: 'id123'
  }]
}
const LIMIT = 0
const OFFSET = 0

const completeSection = (which, corporate = false) => {
  const obj = {}
  const type = (corporate) ? 'corp' : 'indiv'
  const index = [
    ...requiredFields[which]['general'],
    ...requiredFields[which][type]
  ]
  if (which === 'identity_section_status') {
    const extra = requiredFields['identity_section_status_2_opts_required']
    index.push(...extra[0], ...extra[1])
  }
  if (!index.length) throw new Error('BAD_FORMULATED_TEST_SECTION')
  for (const i in index) {
    obj[ index[i] ] = 'data'
  }
  return obj
}

function completeData (corporate = false) {
  const extra = (corporate)
    ? completeSection('corporate_section_status', corporate)
    : {}
  return {
    kyc_section_status: 1,
    status: 'submitted',
    ...completeSection('contact_section_status', corporate),
    ...completeSection('address_section_status', corporate),
    ...completeSection('identity_section_status', corporate),
    ...completeSection('financial_section_status', corporate),
    ...extra
  }
}

const completeMember = {
  ...completeSection('contact_section_status'),
  ...completeSection('address_section_status'),
  ...completeSection('identity_section_status')
}

module.exports = {
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
  completeSection,
  completeData,
  completeMember
}
