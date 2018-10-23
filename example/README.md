# bfx-core-kyc-js

# Install

Clone github repo and install libraries

- Base repo for core functionalities (e.g. services that talk directly to the DB).
- Parent project: https://github.com/bitfinexcom/bfx-svc-js

```console
git clone https://github.com/bitfinexcom/bfx-core-kyc-js.git
cd bfx-core-kyc-js
git remote add upstream https://github.com/bitfinexcom/bfx-svc-js
npm i
```
## Configure service:

```console
cp config/common.json.example config/common.json
cp config/kyc.core.json.example config/kyc.core.json

cp config/facs/db-mongo.config.json.example config/facs/db-mongo.config.json
cp config/facs/grc.config.json.example config/facs/grc.config.json
cp config/facs/grc-s3.config.json.example config/facs/grc-s3.config.json
cp config/facs/auth-google.config.json.example config/facs/auth-google.config.json
```
## Configure S3 server connection:

Configure the specific bucket and acl to use.
- If set to null would use the predetermined ones of the network

```console
vim config/default.json
## set s3 value
```
## Configure google auth login:

Configure the client id and client secret of the google project as to be able to log in via google auth

```console
vim config/default.json
## set google value
```

## Configure adm users:

Add admin users to “ADM_USERS” setting email, password and level.
- If password is set to false, admin would only be able to login by google auth

```console
vim config/default.json
## set ADM_USERS value
```

### Admin levels

There are 3 levels of admin access.
- Level 0: can do everything
- Level 1: cannot access to the monitoring list
- Level 2: can access to only pending section

# Run

## Other Requirements

### Grenache network

- Install `Grenache Grape`: <https://github.com/bitfinexcom/grenache-grape>:

```console
npm i -g grenache-grape
```

- Run two Grapes

```console
grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002'
grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001'
```

### Other workers

This project needs other workers to be running on the grenache network as to be able to work properly:
- https://github.com/bitfinexcom/bfx-ext-s3-js
- https://github.com/bitfinexcom/bfx-ext-sendgrid-js
- https://github.com/bitfinexcom/bfx-core-user-js

## Start

```console
node worker.js --env=development --wtype=wrk-core-kyc-api --apiPort 1338
```
## Testing

Before starting the service run the tests as to be sure everything is working fine.
-Tests create a testing environment so this wont interfere with development or production data

### Run tests

```console
npm test
```
