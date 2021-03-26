# sensible_ft_server

## Notice!

- 目前只有 genesis、issue 接口是可以正常运作，transfer 会验证失败，还在调试中。
- 必须运行在 nodejs_12.0.0 以上，nodejs 版本切换后 npm 可能因为版本不兼容而无法正常工作，遇到时可以先切回来
- 主网运行必须使用 metasv 接口，whatsonchain 不支持 transfer 的 10k 脚本
- 本项目合约来自<a href="https://github.com/sensing-contract/token_sensible/blob/master/docs/token_cn.md">token_sensible</a>项目

## Protocol

#### TokenGenesis

- FT 的定义和发行合约

```
[code part](variable)
[data part](all 108 bytes)
	[specific data for proto_type](all 96 bytes)
		token_name		(20 bytes) token的名称,如Bitcoin
		token_symbol 	(10 bytes) token的缩写,如BTC
		is_genesis		(1 bytes)  是否是根节点
		decimal_num 	(1 bytes)  token的小数位数
		token_address 	(20 bytes) token所属的地址
		token_amount  	(8 bytes)  token的数量
		token_id 		(36 bytes) 32字节的txid和4字节的output_index组成，即outpoint。
	[proto header](all 12 bytes)
		proto_type 		(4 bytes)  协议类型 1
		proto_flag 		(8 bytes)  固定的字符串'oraclesv';
```

#### Token

- FT 的具体实例，根据 token_address 区别持有人

```
  [code part](variable)
  [data part](all 108 bytes)
  	[specific data for proto_type](all 96 bytes)
  		token_name		(20 bytes) token的名称,如Bitcoin
  		token_symbol 	(10 bytes) token的缩写,如BTC
  		is_genesis		(1 bytes)  是否是根节点
  		decimal_num 	(1 bytes)  token的小数位数
  		token_address 	(20 bytes) token所属的地址
  		token_amount  	(8 bytes)  token的数量
  		token_id 		(36 bytes) 32字节的txid和4字节的output_index组成，即outpoint。
  	[proto header](all 12 bytes)
  		proto_type 		(4 bytes)  协议类型 1
  		proto_flag 		(8 bytes)  固定的字符串'oraclesv';
```

#### TokenRouteCheck

- 无状态合约

```

[code part](variable)

```

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

src/config/nft.json
{
"default": {
"wif": "cN2gor4vF2eQ1PmzTzJEwps6uvTK4QToUgTxGHN1xUxZ34djL8vR",//发行私钥
"apiTarget": "whatsonchain",//可选 api：whatsonchain,metasv
"network": "test",//可选网络：test,main
"feeb": 0.5,//手续费率
"minSplit": 80,//utxo 最低拆分数量
"maxSplit": 100,//utxo 最大拆分数量
"unitSatoshis": 10000,//拆分的每个 utxo 所含金额
"contractSatoshis": 1000, //合约输出所含金额
},
"production": {//可以追加其他的配置，在启动的时候需要指定 env=production
"wif": "",
"cryptedWif":"U2FsdGVkX1++zNjes6yFJqGdLSTLegCgdDevX3UVkYYia1tCbqebSwtLKkUP7BVt8eutVcTAAn4Bm83V/fdgvD7UpBpxzQldAHbkdPGK35I=",//to avoid expose wif
"apiTarget": "whatsonchain",
"network": "main",
"feeb": 0.5,
"minSplit": 80,
"maxSplit": 100,
"unitSatoshis": 30000,
"contractSatoshis": 3000,
}
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

| param       | required | type   | note     |
| ----------- | -------- | ------ | -------- |
| tokenName   | true     | string | 20 bytes |
| tokenSymbol | true     | number | 10 bytes |
| decimalNum  | true     | number | 1 bytes  |

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

| param           | required | type   | note             |
| --------------- | -------- | ------ | ---------------- |
| genesisId       | true     | string | genesisId        |
| tokenAmount     | true     | string | token amount     |
| receiverAddress | true     | string | receiver address |

- req

```shell
curl -X POST -H "Content-Type: application/json" --data '{
    "genesisId":"4e1edf5b89300210001ed6f7c7398a0222faefebb24a4c35c14cd47ad39bfd1d",
    "tokenAmount":100,
    "receiverAddress":"1MzEyAMS3eM63gMcc9AVjZSEu4j3KYpBVQ"
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
    	"amount":2
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
