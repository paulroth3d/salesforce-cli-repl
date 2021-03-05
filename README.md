# Overview

Simple project to make it easy to connect to salesforce over node REPL CLI.

For example:

* Start [node repl / command line interface](https://nodejs.org/api/repl.html): `node --experimental-repl-await`

* import the module: `const connector = require('....');`

* get a connection: `let conn = await connector.getConnection('Some_Salesforce_CLI_Alias');`

* run with gas, because you now have a valid [jsForce connection](https://jsforce.github.io/document/): `const accountDescribe = await conn.describeSObject('Account');`

## What would I use this for?

Essentially anything you can do with a valid JsForce connection:

* You can get all picklist fields:

```
let allAccountPicklistFields = await conn.describeSObject('Account').fields
	.filter((f) => f.type === "Picklist");
//
```

* You can get a clear list of all fields

```
let fieldList['Account'] = accountDescribe
	.map(({name, label}) => ({name, label});

```

# See Also

* [JsForce](https://jsforce.github.io/document/)
* [JsForce Web Console](https://jsforce.github.io/jsforce-web-console/)

