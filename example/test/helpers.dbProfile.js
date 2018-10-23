/* eslint-env mocha */
'use strict'
const assert = require('assert')

function _checkAdmin (dbProfile) {
  assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: 'kyc.adminTokens' }, 'Checks admin token')
}

function _updateStatusLogs (dbProfile) {
  assert.deepStrictEqual(dbProfile.shift(), { op: 'update',
    ns: 'kyc.statusLogs',
    nMatched: 0,
    nModified: 0 }, 'Saves the new log on status logs')
}

function createMainAccount (dbProfile, admin = false, corporate = false) {
  if (admin) _checkAdmin(dbProfile)
  assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: 'kyc.compliances' }, 'Checks there is not another main account created, createMainAccount()')
  if (corporate) {
    assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: 'kyc.compliances' }, 'Checks if other main account, createMainAccount()')
  }
  assert.deepStrictEqual(dbProfile.shift(), { op: 'update',
    ns: 'kyc.compliances',
    nMatched: 0,
    nModified: 0 }, 'Creates the account, createMainAccount()')
  _updateStatusLogs(dbProfile)
}

function createMemberAccount (dbProfile, admin = false) {
  if (admin) _checkAdmin(dbProfile)
  assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: 'kyc.compliances' }, 'Checks there is not another main account created, createMainAccount()')
  assert.deepStrictEqual(dbProfile.shift(), { op: 'update',
    ns: 'kyc.compliances',
    nMatched: 0,
    nModified: 0 }, 'Creates the account, createMainAccount()')
}

function updateCompliances (dbProfile, admin = false, updateStatus = false, corporate = false, admCheck = true) {
  if (admin) _checkAdmin(dbProfile)
  assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: 'kyc.compliances' }, 'Checks old data saved, updateCompliances()')
  if (corporate) {
    assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: 'kyc.compliances' }, 'Checks if other main account, createMainAccount()')
  }
  assert.deepStrictEqual(dbProfile.shift(), { op: 'update', ns: 'kyc.compliances', nMatched: 1, nModified: 1 }, 'Updates data, updateCompliances()')
  if (updateStatus) _updateStatusLogs(dbProfile)
  if (admin) {
    const matched = (admCheck) ? 1 : 0
    assert.deepStrictEqual(dbProfile.shift(), { op: 'update',
      ns: 'kyc.adminChecks',
      nMatched: matched,
      nModified: matched }, 'Update check edit')
  }
}

function findByType (dbProfile, collection) {
  // find by type
  _checkAdmin(dbProfile)
  assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: `kyc.${collection}` }, 'searches compliances, findByType()')
  assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: 'kyc.recentlies' }, 'searches recentlies, findByType()')
}

function fetch (dbProfile, collection, admin = false) {
  if (admin) _checkAdmin(dbProfile)
  assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: `kyc.${collection}` }, 'searches compliances, deleteOp()')
}

function deleteOp (dbProfile, collection, admin = false) {
  if (admin) _checkAdmin(dbProfile)
  assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: `kyc.${collection}` }, 'Should fetch to check data to delete, deleteOp()')
  assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: 'kyc.compliances' }, 'Should fetch main account data, deleteOp()')
  assert.deepStrictEqual(dbProfile.shift(), { op: 'remove', ns: `kyc.${collection}` }, 'Should be a remove operation, deleteOp()')
}

function adminCheckEdit (dbProfile) {
  _checkAdmin(dbProfile)
  assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: 'kyc.adminChecks' }, 'Checks open files, adminCheckEdit()')
  assert.deepStrictEqual(dbProfile.shift(), { op: 'query', ns: 'kyc.adminChecks' }, 'Checks save files, adminCheckEdit()')
  assert.deepStrictEqual(dbProfile.shift(), { op: 'update',
    ns: 'kyc.adminChecks',
    nMatched: 0,
    nModified: 0 }, 'Saves admin token, adminCheckEdit()')
}

function loginAdmin (dbProfile) {
  assert.deepStrictEqual(dbProfile.shift(), { op: 'insert', ns: 'kyc.adminTokens' }, 'Login admin Account')
}

module.exports = {
  createMainAccount,
  updateCompliances,
  findByType,
  fetch,
  deleteOp,
  adminCheckEdit,
  loginAdmin,
  createMemberAccount
}
