const { app } = require("../app");
const { bsv, Bytes, toHex } = require("scryptlib");
const { UtxoMgr } = require("./UtxoMgr");
const TokenUtil = require("../lib/sensible_ft/tokenUtil");
const { PrivateKeyMgr } = require("./PrivateKeyMgr");
const { CodeError } = require("../util/CodeError");
const { ErrCode } = require("../const");
const { IssuerDao } = require("../dao/IssuerDao");
const { UtxoDao } = require("../dao/UtxoDao");
const { ScriptHelper } = require("../lib/sensible_nft/ScriptHelper");
const {
  FungibleToken,
  ROUTE_CHECK_TYPE_3To3,
  ROUTE_CHECK_TYPE_6To6,
  ROUTE_CHECK_TYPE_10To10,
  ROUTE_CHECK_TYPE_3To100,
  ROUTE_CHECK_TYPE_20To3,
} = require("../lib/sensible_ft/FungibleToken");
const { FungibleTokenDao } = require("../dao/FungibleTokenDao");
const TokenProto = require("../lib/sensible_ft/tokenProto");
const { toBufferLE } = require("bigint-buffer");

const sizeOfGenesis = 4077;

class FtMgr {
  /**
   * genesis
   * @param {string} tokenName token name.
   * @param {string} tokenSymbol token symbol.
   * @param {number} decimalNum the token amount decimal number.1 bytes
   * @returns
   */
  static async genesis(tokenName, tokenSymbol, decimalNum) {
    const config = app.get("ftConfig");
    const estimateSatoshis = config.feeb * 4280 + 2000;
    return await UtxoMgr.tryUseUtxos(estimateSatoshis, async (utxos) => {
      const utxo = utxos[0];
      const utxoTxId = utxo.txId;

      let preUtxoTxHex = await ScriptHelper.blockChainApi.getRawTxData(
        utxoTxId
      );

      const issuerPubKey = PrivateKeyMgr.privateKey.publicKey;
      const utxoPrivateKey = PrivateKeyMgr.privateKey;
      const changedAddress = PrivateKeyMgr.privateKey.toAddress();
      const feeb = config.feeb;

      let ft = new FungibleToken(
        BigInt("0x" + config.oracles[0].satotxPubKey),
        BigInt("0x" + config.oracles[1].satotxPubKey),
        BigInt("0x" + config.oracles[2].satotxPubKey)
      );

      //create genesis contract
      let genesisContract = ft.createGenesisContract(issuerPubKey, {
        tokenName,
        tokenSymbol,
        decimalNum,
      });

      //create genesis tx
      let tx = ft.createGenesisTx(
        utxoPrivateKey,
        utxos,
        changedAddress,
        feeb,
        genesisContract
      );

      let txid = await ScriptHelper.sendTx(tx);

      //save genesis info
      IssuerDao.insertIssuer({
        genesisId: txid,
        genesisTxId: txid,
        genesisOutputIndex: 0,
        preTxId: utxoTxId,
        preOutputIndex: 0,
        preTxHex: preUtxoTxHex,
        txId: tx.id,
        outputIndex: 0,
        txHex: tx.serialize(),
        tokenName,
        tokenSymbol,
        decimalNum,
      });

      return {
        genesisId: txid,
      };
    });
  }

  /**
   * 发行token
   * @param {string} genesisId token唯一标识
   * @param {number} tokenAmount 此次要发行的数量，如果发行数量为0，则表示不再允许增发
   * @param {string} address 接受者的地址
   * @param {string} allowIssueInAddition 是否允许继续增发
   * @returns
   */
  static async issue(genesisId, tokenAmount, address, allowIssueInAddition) {
    const config = app.get("ftConfig");
    const estimateSatoshis = config.feeb * 22969 + 2000;
    return await UtxoMgr.tryUseUtxos(estimateSatoshis, async (utxos) => {
      let issuer = await IssuerDao.getIssuer(genesisId);
      if (!issuer) {
        throw `invalid genesisId:${genesisId}`;
      }
      const genesisTx = new bsv.Transaction(issuer.txHex);
      const genesisLockingScript = genesisTx.outputs[0].script;
      const receiverAddress = bsv.Address.fromString(
        address,
        config.network == "main" ? "livenet" : "testnet"
      );

      const issuerPrivKey = PrivateKeyMgr.privateKey;
      const issuerPubKey = PrivateKeyMgr.privateKey.publicKey;
      const genesisTxId = issuer.genesisTxId;
      const genesisOutputIndex = issuer.genesisOutputIndex;
      const utxoPrivateKey = PrivateKeyMgr.privateKey;
      const changedAddress = PrivateKeyMgr.privateKey.toAddress();
      const feeb = config.feeb;

      const preUtxoTxId = issuer.preTxId;
      const preUtxoOutputIndex = issuer.preOutputIndex;
      const preUtxoTxHex = issuer.preTxHex;
      const spendByTxId = issuer.txId;
      const spendByOutputIndex = issuer.outputIndex;
      const spendByTxHex = issuer.txHex;

      let ft = new FungibleToken(
        BigInt("0x" + config.oracles[0].satotxPubKey),
        BigInt("0x" + config.oracles[1].satotxPubKey),
        BigInt("0x" + config.oracles[2].satotxPubKey)
      );

      //重新构建要解锁的genesis合约
      let oracleDataObj = TokenProto.parseOracleData(
        genesisLockingScript.toBuffer()
      );
      let genesisContract = ft.createGenesisContract(issuerPubKey);
      const oracleData = TokenProto.newOracleData(oracleDataObj);
      genesisContract.setDataPart(oracleData.toString("hex"));

      //创建token合约
      let tokenContract = ft.createTokenContract(
        genesisTxId,
        genesisOutputIndex,
        genesisContract,
        {
          receiverAddress,
          tokenAmount: BigInt(tokenAmount),
        }
      );
      const genesisUtxo = {
        txId: genesisTxId,
        outputIndex: genesisOutputIndex,
        satoshis: ScriptHelper.getDustThreshold(
          genesisContract.lockingScript.toBuffer().length
        ),
      };

      //创建token：解锁genesis，产出新的genesis合约UTXO和token合约UTXO
      let tx = await ft.createIssueTx(
        genesisContract,
        issuerPrivKey,
        genesisOutputIndex,
        genesisLockingScript,
        genesisUtxo,
        utxoPrivateKey,
        utxos,
        changedAddress,
        feeb,
        tokenContract,
        allowIssueInAddition,
        {
          index: preUtxoOutputIndex,
          txId: preUtxoTxId,
          txHex: preUtxoTxHex,
          byTxId: spendByTxId,
          byTxHex: spendByTxHex,
        },
        config.oracleSelecteds
      );

      let txid = await ScriptHelper.sendTx(tx);

      //更新发行合约信息
      IssuerDao.updateIssuer(genesisId, {
        preTxId: issuer.txId,
        preTxHex: issuer.txHex,
        txId: tx.id,
        txHex: tx.serialize(),
      });

      //保存产出的token合约UTXO的信息
      FungibleTokenDao.addUtxos(address, [
        {
          genesisId,
          txId: txid,
          satoshis: tx.outputs[1].satoshis,
          outputIndex: 1, //固定在1号位
          rootHeight: 0,
          lockingScript: tx.outputs[1].script.toHex(),
          txHex: tx.serialize(),
          tokenAddress: address,
          tokenAmount: tokenAmount,
          preTxId: spendByTxId,
          preOutputIndex: spendByOutputIndex,
          preTxHex: spendByTxHex,
          preTokenAddress: address,
          preTokenAmount: 0,
        },
      ]);

      console.log("issue success", txid);
      return {
        txId: txid,
      };
    });
  }
  /**
   * 转移token
   * @param {string} genesisId token唯一标识
   * @param {string} senderWif 发送者的wif
   * @param {array} receivers 输出列表
   * @returns
   */
  static async transfer(genesisId, senderWif, receivers) {
    const config = app.get("ftConfig");
    let issuer = await IssuerDao.getIssuer(genesisId);
    if (!issuer) {
      throw "invalid genesisId";
    }
    const genesisTx = new bsv.Transaction(issuer.txHex);
    const genesisLockingScript = genesisTx.outputs[0].script;

    const genesisTxId = issuer.genesisTxId;
    const genesisOutputIndex = issuer.genesisOutputIndex;
    const senderPrivateKey = PrivateKeyMgr.privateKey;
    const utxoPrivateKey = PrivateKeyMgr.privateKey; //new bsv.PrivateKey.fromWIF(senderWif);
    const changedAddress = PrivateKeyMgr.privateKey.toAddress();
    const feeb = config.feeb;
    const issuerPubKey = PrivateKeyMgr.privateKey.publicKey;
    let ft = new FungibleToken(
      BigInt("0x" + config.oracles[0].satotxPubKey),
      BigInt("0x" + config.oracles[1].satotxPubKey),
      BigInt("0x" + config.oracles[2].satotxPubKey)
    );

    const network = config.network == "main" ? "livenet" : "testnet";
    let tokenOutputArray = receivers.map((v) => ({
      address: bsv.Address.fromString(v.address, network),
      tokenAmount: v.amount,
    }));

    let ftUtxos = [];
    let estimateSatoshis = config.feeb * 6446 + 6000;
    let routeCheckContract;

    let routeCheckTx = await UtxoMgr.tryUseUtxos(
      estimateSatoshis,
      async (utxos) => {
        let outputTokenAmountSum = tokenOutputArray.reduce(
          (pre, cur) => pre + cur.tokenAmount,
          0
        );

        let _ftUtxos = await FungibleTokenDao.getUtxos(
          senderPrivateKey.toAddress().toString(),
          genesisId
        );
        let inputTokenAmountSum = 0;
        for (let i = 0; i < _ftUtxos.length; i++) {
          let ftUtxo = _ftUtxos[i];
          ftUtxos.push(ftUtxo);
          inputTokenAmountSum += ftUtxo.tokenAmount;
          if (inputTokenAmountSum >= outputTokenAmountSum) {
            break;
          }
        }

        if (inputTokenAmountSum < outputTokenAmountSum) {
          throw "insufficent token";
        }
        let changeTokenAmount = inputTokenAmountSum - outputTokenAmountSum;
        if (changeTokenAmount > 0) {
          tokenOutputArray.push({
            address: changedAddress,
            tokenAmount: changeTokenAmount,
          });
        }

        let routeCheckType;
        if (ftUtxos.length <= 3) {
          if (tokenOutputArray.length <= 3) {
            routeCheckType = ROUTE_CHECK_TYPE_3To3;
          } else if (tokenOutputArray.length <= 100) {
            routeCheckType = ROUTE_CHECK_TYPE_3To100;
          } else {
            throw "unsupport token output count";
          }
        } else if (ftUtxos.length <= 6) {
          if (tokenOutputArray.length <= 6) {
            routeCheckType = ROUTE_CHECK_TYPE_6To6;
          } else {
            throw "unsupport token output count";
          }
        } else if (ftUtxos.length <= 10) {
          if (tokenOutputArray.length <= 10) {
            routeCheckType = ROUTE_CHECK_TYPE_10To10;
          } else {
            throw "unsupport token output count";
          }
        } else if (ftUtxos.length <= 20) {
          if (tokenOutputArray.length <= 3) {
            routeCheckType = ROUTE_CHECK_TYPE_20To3;
          } else {
            throw "unsupport token output count";
          }
        } else {
          throw "unsupport token input count";
        }

        console.log(routeCheckType);
        //create routeCheck contract
        routeCheckContract = ft.createRouteCheckContract(
          routeCheckType,
          tokenOutputArray,
          TokenProto.newTokenID(genesisTxId, genesisOutputIndex),
          TokenProto.getContractCodeHash(
            Buffer.from(ftUtxos[0].lockingScript, "hex")
          )
        );

        //create routeCheck tx
        let tx = ft.createRouteCheckTx(
          utxoPrivateKey,
          utxos,
          changedAddress,
          feeb,
          routeCheckContract
        );
        let txid = await ScriptHelper.sendTx(tx);
        // console.log("routeCheckTx", txid);
        return tx;
      }
    );

    //拿到上面一笔检查合约后才可以进行接下来的token转移
    estimateSatoshis = config.feeb * 35846 + 2000 + 20000;
    return await UtxoMgr.tryUseUtxos(estimateSatoshis, async (utxos) => {
      //此次转移要用到的token合约utxo
      const tokenInputArray = ftUtxos.map((v) => ({
        lockingScript: v.lockingScript,
        satoshis: v.satoshis,
        txId: v.txId,
        outputIndex: v.outputIndex,
        preTokenAddress: bsv.Address.fromString(v.preTokenAddress, network),
        preTokenAmount: BigInt(v.preTokenAmount),
      }));

      //此次转移要用到的utxo
      const satoshiInputArray = utxos.map((v) => ({
        lockingScript: bsv.Script.buildPublicKeyHashOut(
          utxoPrivateKey.toAddress()
        ).toHex(),
        satoshis: v.satoshis,
        txId: v.txId,
        outputIndex: v.outputIndex,
      }));

      //解锁数量检查合约CheckRoute时，需要对输入列表中的token进行合法性校验，下面是需要的校验数据
      let checkRabinMsgArray = Buffer.alloc(0);
      let checkRabinPaddingArray = Buffer.alloc(0);
      let checkRabinSigArray = Buffer.alloc(0);

      for (let i = 0; i < ftUtxos.length; i++) {
        let v = ftUtxos[i];

        for (let j = 0; j < 2; j++) {
          const signerIndex = config.oracleSelecteds[j];
          let sigInfo = await ScriptHelper.signers[signerIndex].satoTxSigUTXO({
            txId: v.txId,
            index: v.outputIndex,
            txHex: v.txHex,
          });
          if (j == 0) {
            checkRabinMsgArray = Buffer.concat([
              checkRabinMsgArray,
              Buffer.from(sigInfo.payload, "hex"),
            ]);
          }

          const sigBuf = toBufferLE(sigInfo.sigBE, TokenUtil.RABIN_SIG_LEN);
          checkRabinSigArray = Buffer.concat([checkRabinSigArray, sigBuf]);
          const paddingCountBuf = Buffer.alloc(2, 0);
          paddingCountBuf.writeUInt16LE(sigInfo.padding.length / 2);
          const padding = Buffer.alloc(sigInfo.padding.length / 2, 0);
          padding.write(sigInfo.padding, "hex");
          checkRabinPaddingArray = Buffer.concat([
            checkRabinPaddingArray,
            paddingCountBuf,
            padding,
          ]);
        }
      }

      // throw "end";
      const tokenRabinDatas = [];
      for (let i = 0; i < ftUtxos.length; i++) {
        let v = ftUtxos[i];
        let tokenRabinMsg;
        let tokenRabinSigArray = [];
        let tokenRabinPaddingArray = [];
        for (let j = 0; j < 2; j++) {
          const signerIndex = config.oracleSelecteds[j];
          let sigInfo = await ScriptHelper.signers[
            signerIndex
          ].satoTxSigUTXOSpendBy({
            txId: v.preTxId,
            index: v.preOutputIndex,
            txHex: v.preTxHex,
            byTxId: v.txId,
            byTxHex: v.txHex,
          });
          tokenRabinMsg = sigInfo.payload;
          tokenRabinSigArray.push(BigInt("0x" + sigInfo.sigBE));
          tokenRabinPaddingArray.push(new Bytes(sigInfo.padding));
        }

        tokenRabinDatas.push({
          tokenRabinMsg,
          tokenRabinSigArray,
          tokenRabinPaddingArray,
        });
      }

      let rabinPubKeyIndexArray = config.oracleSelecteds;

      //重新构建要解锁的genesis合约
      let oracleDataObj = TokenProto.parseOracleData(
        genesisLockingScript.toBuffer()
      );
      let genesisContract = ft.createGenesisContract(issuerPubKey);
      const oracleData = TokenProto.newOracleData(oracleDataObj);
      genesisContract.setDataPart(oracleData.toString("hex"));

      //创建token合约
      let tokenContract = ft.createTokenContract(
        genesisTxId,
        genesisOutputIndex,
        genesisContract
      );
      //创建tx
      let tx = await ft.createTransferTx(
        routeCheckTx,
        tokenInputArray,
        satoshiInputArray,
        rabinPubKeyIndexArray,
        checkRabinMsgArray,
        checkRabinPaddingArray,
        checkRabinSigArray,
        ftUtxos.map((v) => utxoPrivateKey),
        utxos.map((v) => utxoPrivateKey),
        tokenOutputArray,
        changedAddress,
        tokenRabinDatas,
        tokenContract,
        routeCheckContract,
        feeb
      );

      let txid = await ScriptHelper.sendTx(tx);
      //db更新token合约UTXO的信息
      tokenOutputArray.forEach((v, index) => {
        FungibleTokenDao.addUtxos(v.address.toString(), [
          {
            genesisId,
            txId: txid,
            satoshis: tx.outputs[index].satoshis,
            outputIndex: index,
            rootHeight: 0,
            lockingScript: tx.outputs[index].script.toHex(),
            tokenAddress: v.address.toString(),
            tokenAmount: v.tokenAmount,
            txHex: tx.serialize(),
            preTxId: ftUtxos[0].txId,
            preOutputIndex: ftUtxos[0].outputIndex,
            preTxHex: ftUtxos[0].txHex,
            preTokenAddress: ftUtxos[0].tokenAddress,
            preTokenAmount: ftUtxos[0].tokenAmount,
          },
        ]);
      });

      ftUtxos.forEach((v) => {
        FungibleTokenDao.removeUtxo(
          senderPrivateKey.toAddress().toString(),
          v.txId,
          v.outputIndex
        );
      });

      console.log("transfer success", txid);

      return {
        txId: txid,
      };
    });
  }
}

module.exports = {
  FtMgr,
};
