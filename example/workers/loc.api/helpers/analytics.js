'use strict'
const _ = require('lodash')

function _timeFrameQ (type) {
  switch (type) {
    case 'month':
      return { month: { $dateToString: { format: '%Y-%m', date: '$date' } } }
    case 'day':
      return { day: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } }
    case 'week':
      return { week: { $dateToString: { format: '%U', date: '$date' } } }
    case 'year':
      return { year: { $dateToString: { format: '%Y', date: '$date' } } }
    default:
      throw new Error('KYC_ERROR_POSSIBLE_TYPES_OF_TIME_FRAMES')
  }
}

function generalTrigger (andQuery, timeFrame = null) {
  const dateFrame = (timeFrame) ? _timeFrameQ(timeFrame) : []
  return [
    {
      $match: andQuery
    },
    {
      $group: {
        _id: { status: '$status', uid: '$uid' },
        status: { $last: '$status' },
        uid: { $last: '$uid' },
        date: { $max: '$date' },
        actor: { $last: '$actor' },
        net_worth_usd: { $last: '$net_worth_usd' }
      }
    },
    {
      $group: {
        _id: { status: '$status', ...dateFrame },
        status: { $last: '$status' },
        arr: { $push: {
          uid: '$uid',
          last: '$last',
          actor: '$actor',
          net_worth_usd: '$net_worth_usd'
        } },
        amount: { $sum: 1 }
      }
    }
  ]
}

function generalFinalStatus (andQuery, timeFrame = null) {
  const dateFrame = (timeFrame) ? _timeFrameQ(timeFrame) : []
  const opts = (andQuery && andQuery['$and']) ? andQuery['$and'] : []
  let status = null
  const and = _.transform(opts, (result, value) => {
    if (value.status) {
      status = value.status
    } else {
      result.push(value)
    }
    return result
  }, [])
  const mainAnd = (and && and.length) ? { $and: and } : {}
  const statusAnd = (status) ? { $and: [ { status } ] } : {}

  return [
    {
      $match: mainAnd
    },
    {
      $group: {
        _id: '$uid',
        status: { $last: '$status' },
        uid: { $last: '$uid' },
        date: { $last: '$date' },
        actor: { $last: '$actor' },
        last: { $max: '$timestamp' },
        net_worth_usd: { $last: '$net_worth_usd' }
      }
    },
    {
      $group: {
        _id: { status: '$status', ...dateFrame },
        status: { $last: '$status' },
        arr: { $push: {
          uid: '$uid',
          last: '$last',
          actor: '$actor',
          net_worth_usd: '$net_worth_usd'
        } },
        amount: { $sum: 1 }
      }
    },
    {
      $match: statusAnd
    }
  ]
}

function statsTransform (res) {
  return _.transform(res, (acum, obj) => {
    const admins = _getAdminsStats(obj.arr)
    const { _id, amount } = obj
    acum.push({ _id, amount, admins })
  }, [])
}

function _getAdminsStats (arr) {
  const admins = {}
  arr.forEach((obj) => {
    if (admins[obj.actor] && admins[obj.actor].amount) {
      admins[obj.actor].amount++
    } else if (obj.actor !== 'user') {
      admins[obj.actor] = { amount: 1 }
    }
  })
  return admins
}

function getPossibleUidForGeneral (arr) {
  const res = _.transform(arr, (result, value, key) => {
    if (
      value.uid &&
      !result.includes(value.uid)
    ) {
      result.push(value.uid)
    }
    return result
  }, [])
  return res
}

function getFirstDates (andQuery, lastStatus, possiblesUid) {
  const and = []

  const uid = { $in: possiblesUid }
  and.push({ uid })

  const status = (lastStatus === 'verified') ? 'submitted' : 'incomplete'
  and.push({ status })

  const opts = (andQuery && andQuery['$and']) ? andQuery['$and'] : []
  opts.forEach((filter) => {
    const key = Object.keys(filter)[0]
    if (!['uid', 'status', 'timestamp'].includes(key)) {
      and.push(filter)
    }
    if (key === 'timestamp') {
      const timestamp = _.assign({}, filter.timestamp, { '$gte': 0 })
      and.push({ timestamp })
    }
  })
  const mainAnd = (and && and.length) ? { $and: and } : {}

  return [
    {
      $match: mainAnd
    },
    {
      $group: {
        _id: '$uid',
        uid: { $last: '$uid' },
        first: { $max: '$timestamp' }
      }
    }
  ]
}

function getAverage (first, last, precision) {
  const editKeys = (obj) => {
    return _.mapKeys(obj, (value, key) => {
      return value.uid
    })
  }
  const removeNoiseAndSum = (arr, notConsidered) => {
    arr.sort((a, b) => { return parseFloat(a) - parseFloat(b) })
    for (let i = 0; notConsidered > i; i += 2) {
      arr.pop()
      arr.shift()
    }
    return _.sum(arr)
  }

  const totalAmount = last.length
  const notConsidered = Math.floor((1 - precision) * totalAmount / 2) * 2
  const consideredAmount = totalAmount - notConsidered

  const merge = _.merge({}, editKeys(first), editKeys(last))
  const obj = _.transform(merge, (result, value, key) => {
    if (value.last && value.first) {
      const diff = value.last - value.first
      result.time.push(diff)
      result.net_worth_usd.push(value.net_worth_usd)
      return result
    }
  }, { time: [], net_worth_usd: [] })
  const timeSum = removeNoiseAndSum(obj.time, notConsidered)
  const usdSum = removeNoiseAndSum(obj.net_worth_usd, notConsidered)

  const msInS = 1000
  const seconds = parseInt(timeSum / consideredAmount / msInS)
  const usd = parseInt(usdSum / consideredAmount)

  return { average: { seconds, usd }, consideredAmount, totalAmount }
}

function adminTrigger (andQuery) {
  return [
    {
      $match: andQuery
    },
    {
      $group: {
        _id: { status: '$status', actor: '$actor' },
        actor: { $last: '$actor' },
        status: { $last: '$status' },
        arr: { $push: {
          uid: '$uid',
          last: '$timestamp',
          net_worth_usd: '$net_worth_usd'
        } },
        amount: { $sum: 1 }
      }
    }
  ]
}

function mapAdminTrigger (res) {
  const group = _.transform(res, (result, value, key) => {
    if (value.actor !== 'user') {
      const obj = {
        status: value.status,
        amount: value.amount
      }
      if (result[value.actor]) result[value.actor].push(obj)
      else result[value.actor] = [obj]
    }
    return result
  }, {})
  const map = _.transform(group, (result, value, key) => {
    const totalTrigger = _.sumBy(value, (o) => { return o.amount })
    result.push({
      actor: key,
      totalTrigger,
      trigger: value
    })
    return result
  }, [])
  return _.sortBy(map, ['actor'])
}
function getPossibleUidForAdmin (res) {
  const uidArr = _.transform(res, (result, value, key) => {
    if (value.status === 'verified' && value.actor !== 'user') {
      for (const v in value.arr) {
        if (
          value.arr[v].uid &&
          !result.includes(value.arr[v].uid)
        ) {
          result.push(value.arr[v].uid)
        }
      }
    }
    return result
  }, [])
  return uidArr
}

function getAdminsAverages (res, firstRes, precision) {
  const average = _.transform(res, (result, value, key) => {
    if (value.status === 'verified' && value.actor !== 'user') {
      const obj = {
        actor: value.actor,
        status: value.status,
        ...getAverage(firstRes, value.arr, precision)
      }
      result.push(obj)
    }
    return result
  }, [])
  return _.sortBy(average, ['actor'])
}

module.exports = {
  generalTrigger,
  generalFinalStatus,
  getFirstDates,
  getAverage,
  adminTrigger,
  mapAdminTrigger,
  getAdminsAverages,
  getPossibleUidForGeneral,
  getPossibleUidForAdmin,
  statsTransform
}
