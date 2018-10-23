'use strict'

const schema = {
  'GENERAL': [
    '_id',
    'uid',
    'timestamp',
    'type_account',
    'resident_country',
    'status',
    'is_main_account',
    'is_canceled',
    'language',
    'is_preliminary_completed',
    'notes',
    'notify',
    'verification_timestamp'
  ],
  'VERIFICATION': [
    'verification_reason_crypto',
    'verification_reason_trade',
    'verification_reason_lend',
    'verification_reason_fiat',
    'verification_reason_tether',
    'verification_reason_apis',
    'verification_reason_nectar',
    'verification_reason_fiat',
    'user_agreed_with_terms'
  ],
  'ONLY_ADMIN_KEYS': [
    'is_monitored',
    'contact_section_status',
    'address_section_status',
    'corporate_section_status',
    'identity_section_status',
    'financial_section_status'
  ],
  'ONLY_ADMIN_SET_STATUS_2_KEYS': [
    'kyc_section_status'
  ],
  'CONTACT': [
    'first_name',
    'middle_name',
    'last_name',
    'dob',
    'nationality',
    'gender',
    'phone_country_code',
    'phone_area_code',
    'phone',
    'email',
    'corporate_website',
    'core_username',
    'core_email'
  ],
  'ADDRESS_FIELDS': [
    'country',
    'state',
    'city',
    'district',
    'building_name',
    'street',
    'office_floor',
    'appt_nb',
    'zipcode'
  ],
  'ADDRESS': [
    'resid_country',
    'resid_state',
    'resid_city',
    'resid_district',
    'resid_building_name',
    'resid_street',
    'resid_office_floor',
    'resid_appt_nb',
    'resid_zipcode'
  ],
  'IDENTITY': [
    'passport_firstname',
    'passport_lastname',
    'passport_middle1',
    'passport_middle2',
    'passport_dob',
    'passport_nb',
    'passport_country',
    'passport_check',
    'national_id_firstname',
    'national_id_lastname',
    'national_id_middle1',
    'national_id_middle2',
    'national_id_exp',
    'national_id_nb',
    'national_id_country',
    'national_check',
    'driver_firstname',
    'driver_lastname',
    'driver_middle1',
    'driver_middle2',
    'driver_exp',
    'driver_nb',
    'driver_country',
    'driver_check',
    'other_id_firstname',
    'other_id_lastname',
    'other_id_middle1',
    'other_id_middle2',
    'other_id_exp',
    'other_id_number',
    'other_id_country',
    'other_check',
    'proof_resid_type',
    'proof_resid_date'
  ],
  'IDENTITY_FILES': [
    'passport',
    'identity_front',
    'identity_back',
    'driver_front',
    'driver_back',
    'other_front',
    'other_back',
    'proof_of_res',
    'selfie'
  ],
  'CORPORATE': [
    'account_id',
    'full_corporate_name',
    'incorporation_date',
    'incorporation_country',
    'incorporate_state',
    'incorporation_number',
    'incorporation_tax_id',
    'corp_type',
    'corp_directors'
  ],
  'CORPORATE_FILES': [
    'certificate_of_incorporation',
    'company_memorandum',
    'details_of_ownership',
    'company_bank_statement',
    'company_minutes',
    'authorized_signature',
    'member_register',
    'current_officers_register',
    'ultimate_beneficial_names',
    'list_of_shareholders',
    'list_of_all_directors',
    'certificate_of_incumbency',
    'certificate_of_good_standing'
  ],
  'FINANCIAL_IND': [
    'bank_statement_name',
    'bank_statement_country',
    'bank_account_number',
    'bank_statement_date',
    'occupation_type',
    'industry',
    'job_title',
    'employer_name',
    'employer_country',
    'employer_state',
    'employer_city',
    'employer_district',
    'employer_building_nb',
    'employer_street',
    'employer_zipcode',
    'source_funds',
    'net_worth_usd',
    'expected_investment',
    'investment_stock',
    'investment_exp_nbyears',
    'investment_derivatives_nbyears',
    'investment_derivatives',
    'investment_risks'
  ],
  'FINANCIAL_IND_FILES': [
    'bank_statement'
  ],
  'FINANCIAL_CORP': [
    'bank_account_name',
    'bank_name',
    'bank_branch_location',
    'bank_account_number',
    'bank_swift'
  ],
  'STATUSES': [
    'kyc_section_status'
  ],
  'DOCUMENTS': [
    'filename',
    'url',
    'key',
    'type',
    'remark',
    'comments',
    'is_private'
  ],
  'ADMIN_CHECK_EDIT': [
    'compliances_id',
    'saved_timestamp',
    'open_timestamp'
  ]
}

const requiredFields = {
  'contact_section_status': {
    corp: ['corporate_website'],
    indiv: [],
    general: [
      'first_name',
      'last_name',
      'nationality',
      'phone_country_code',
      'phone_area_code',
      'phone'
    ]
  },
  'address_section_status': {
    corp: [],
    indiv: [],
    general: [
      'resid_country',
      'resid_state',
      'resid_city',
      'resid_building_name',
      'resid_street',
      'resid_zipcode',
      'country',
      'state',
      'city',
      'building_name',
      'street',
      'zipcode'
    ]
  },
  'corporate_section_status': {
    corp: [
      'full_corporate_name',
      'incorporation_country',
      'incorporate_state',
      'incorporation_number',
      'incorporation_tax_id',
      'corp_type',
      'corp_directors'
    ],
    indiv: [
      'section_not_for_individuals'
    ],
    general: []
  },
  'financial_section_status': {
    corp: [
      'bank_account_name',
      'bank_name',
      'bank_branch_location',
      'bank_account_number',
      'bank_swift'
    ],
    indiv: [
      'bank_statement_name',
      'bank_statement_country',
      'bank_account_number',
      'occupation_type',
      'industry',
      'job_title',
      'source_funds',
      'employer_name',
      'employer_country',
      'employer_state',
      'employer_city',
      'employer_district',
      'employer_building_nb',
      'employer_street',
      'employer_zipcode',
      'net_worth_usd',
      'expected_investment',
      'investment_stock',
      'investment_exp_nbyears',
      'investment_derivatives_nbyears',
      'investment_derivatives',
      'investment_risks'
    ],
    general: []
  },
  'identity_section_status': {
    corp: [],
    indiv: ['proof_resid_type'],
    general: []
  },
  'identity_section_status_2_opts_required': [
    [
      'passport_firstname',
      'passport_lastname',
      'passport_nb',
      'passport_country'
    ],
    [
      'national_id_firstname',
      'national_id_lastname',
      'national_id_nb',
      'national_id_country'
    ],
    [
      'driver_firstname',
      'driver_lastname',
      'driver_nb',
      'driver_country'
    ],
    [
      'other_id_firstname',
      'other_id_lastname',
      'other_id_exp',
      'other_id_country',
      'other_id_number'
    ]
  ]
}

module.exports = { schema, requiredFields }
