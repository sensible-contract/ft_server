# sensible_ft_server

A Demo of <a href="https://github.com/sensing-contract/token_sensible/blob/master/docs/token_cn.md">token_sensible</a>

## How to Build

```

npm install
npm gen-desc

```

## How to Run

- mongo
- a private key of bitcoin for you
- satotx support
- node version > 12.0.0

Here is a example for config

```

src/config/ft.json
{
  "default": {
    "wif": "L2YWukZEh9b7wLMLRrZWnaEZCHaTMXnQAH75ZuvhrTvAeFa6vxMM",
    "apiTarget": "metasv",//metasv,whatsonchain
    "network": "main",//main,test
    "feeb": 0.5,
    "minSplit": 30,
    "maxSplit": 100,
    "unitSatoshis": 20000,
    "oracles": [//all three oracles but we only need two rabinSigs to unlock the contract
      {
        "satotxApiPrefix": "https://api.satotx.com",
        "satotxPubKey": "25108ec89eb96b99314619eb5b124f11f00307a833cda48f5ab1865a04d4cfa567095ea4dd47cdf5c7568cd8efa77805197a67943fe965b0a558216011c374aa06a7527b20b0ce9471e399fa752e8c8b72a12527768a9fc7092f1a7057c1a1514b59df4d154df0d5994ff3b386a04d819474efbd99fb10681db58b1bd857f6d5"
      },
      {
        "satotxApiPrefix": "https://api.satotx.com",
        "satotxPubKey": "25108ec89eb96b99314619eb5b124f11f00307a833cda48f5ab1865a04d4cfa567095ea4dd47cdf5c7568cd8efa77805197a67943fe965b0a558216011c374aa06a7527b20b0ce9471e399fa752e8c8b72a12527768a9fc7092f1a7057c1a1514b59df4d154df0d5994ff3b386a04d819474efbd99fb10681db58b1bd857f6d5"
      },
      {
        "satotxApiPrefix": "https://api.satotx.com",
        "satotxPubKey": "25108ec89eb96b99314619eb5b124f11f00307a833cda48f5ab1865a04d4cfa567095ea4dd47cdf5c7568cd8efa77805197a67943fe965b0a558216011c374aa06a7527b20b0ce9471e399fa752e8c8b72a12527768a9fc7092f1a7057c1a1514b59df4d154df0d5994ff3b386a04d819474efbd99fb10681db58b1bd857f6d5"
      }
    ],
    "oracleSelecteds": [0, 1] //the oracle index selected to use
  },
  ...
}

```

and then just run

```

node src/app.js

```

or run in security

```

node src/app.js env=production

```

## <span id="apimethod">Api Method</span>

- [genesis](#genesis)
- [issue](#issue)
- [transfer](#transfer)

### <span id="genesis">genesis</span>

- params

| param       | required | type         | note     |
| ----------- | -------- | ------------ | -------- |
| tokenName   | true     | string       | 20 bytes |
| tokenSymbol | true     | string       | 10 bytes |
| decimalNum  | true     | unsigned int | 1 bytes  |

- req

```shell
curl -X POST  -H "Content-Type: application/json" --data '{
    "tokenName":"ENJIN",
    "tokenSymbol":"ENJ",
    "decimal":2
}' http://127.0.0.1:8092/api/ft/genesis
```

- rsp

```json
{
  "code": 0,
  "msg": "",
  "data": {
    "genesisId": "fd7117f26c7fedb2a5e9bb17ed94f42142e2f2d51cd6b80e25cb7874625dadd5"
  }
}
```

### <span id="issue">issue</span>

- params

| param                | required | type           | note                 |
| -------------------- | -------- | -------------- | -------------------- |
| genesisId            | true     | string         | genesisId            |
| tokenAmount          | true     | unsigned int64 | token amount         |
| receiverAddress      | true     | string         | receiver address     |
| allowIssueInAddition | true     | bool           | allow to issue again |

- req

```shell
curl -X POST -H "Content-Type: application/json" --data '{
    "genesisId":"4e1edf5b89300210001ed6f7c7398a0222faefebb24a4c35c14cd47ad39bfd1d",
    "tokenAmount":"100",
    "receiverAddress":"1MzEyAMS3eM63gMcc9AVjZSEu4j3KYpBVQ",
    "allowIssueInAddition":false
}' http://127.0.0.1:8092/api/ft/issue
```

- rsp

```json
{
  "code": 0,
  "msg": "",
  "data": {
    "txId": "f386bbf17a82047694e19f4fdc7ea209b66bb10ce7fdb31e1afd755a95e93f00"
  }
}
```

### <span id="transfer">transfer</span>

- params

| param     | required | type   | note                             |
| --------- | -------- | ------ | -------------------------------- |
| genesisId | true     | string | genesisId                        |
| senderWif | true     | string | sender wif                       |
| receivers | true     | array  | [{amount:xxx,address:'xxx'},...] |

- req

```shell
curl -X POST -H "Content-Type: application/json" --data '{
    "genesisId":"4e1edf5b89300210001ed6f7c7398a0222faefebb24a4c35c14cd47ad39bfd1d",
    "senderWif":"L2YWukZEh9b7wLMLRrZWnaEZCHaTMXnQAH75ZuvhrTvAeFa6vxMM",
    "receivers":[{
    	"address":"1MzEyAMS3eM63gMcc9AVjZSEu4j3KYpBVQ",
    	"amount":"20"
    }]
}' http://127.0.0.1:8092/api/ft/transfer
```

- rsp

```json
{
  "code": 0,
  "msg": "",
  "data": {
    "txId": "4d83502c13568c24485a2af9bfb5dd5cd764232c9b8b11b287151d10b6995810"
  }
}
```
