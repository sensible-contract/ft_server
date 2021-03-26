const { app } = require("../app");
const { bsv, Bytes } = require("scryptlib");
const { UtxoMgr } = require("./UtxoMgr");
const TokenUtil = require("../lib/sensible_ft/tokenUtil");
const { PrivateKeyMgr } = require("./PrivateKeyMgr");
const { CodeError } = require("../util/CodeError");
const { ErrCode } = require("../const");
const { IssuerDao } = require("../dao/IssuerDao");
const { UtxoDao } = require("../dao/UtxoDao");
const { ScriptHelper } = require("../lib/sensible_nft/ScriptHelper");
const { FungibleToken } = require("../lib/sensible_ft/FungibleToken");
const { FungibleTokenDao } = require("../dao/FungibleTokenDao");
const TokenProto = require("../lib/sensible_ft/tokenProto");
const { toBufferLE } = require("bigint-buffer");
class FtMgr {
  /**
   * 初始化token
   * @param {string} tokenName token名称
   * @param {string} tokenSymbol token缩写符号
   * @param {number} decimalNum 指定小数部分位数
   * @returns
   */
  static async genesis(tokenName, tokenSymbol, decimalNum) {
    const estimateSatoshis =
      app.get("ftConfig").feeb * 4200 * 1 +
      app.get("ftConfig").contractSatoshis * 1;
    return await UtxoMgr.tryUseUtxos(estimateSatoshis, async (utxos) => {
      const utxo = utxos[0];
      const utxoTxId = utxo.txId;
      const utxoOutputIndex = utxo.outputIndex;
      let preUtxoTxHex = await ScriptHelper.blockChainApi.getRawTxData(
        utxoTxId
      );

      const issuerPubKey = PrivateKeyMgr.privateKey.publicKey;
      const utxoPrivateKey = PrivateKeyMgr.privateKey;
      const changedAddress = PrivateKeyMgr.privateKey.toAddress();
      const feeb = app.get("ftConfig").feeb;
      const genesisContractSatoshis = 3000;

      let ft = new FungibleToken();

      //创建genesis合约
      let genesisContract = ft.createGenesisContract(
        issuerPubKey,
        tokenName,
        tokenSymbol,
        decimalNum
      );
      //创建genesis交易
      let tx = ft.createGenesisTx(
        utxoPrivateKey,
        utxos,
        changedAddress,
        feeb,
        genesisContract.lockingScript,
        genesisContractSatoshis
      );

      let txid = await ScriptHelper.sendTx(tx);

      //db保存发行信息
      IssuerDao.insertIssuer({
        genesisId: txid,
        genesisTxId: utxoTxId,
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
   * @returns
   */
  static async issue(genesisId, tokenAmount, address) {
    const estimateSatoshis = app.get("ftConfig").feeb * 8000 * 2 + 8000 * 2;
    return await UtxoMgr.tryUseUtxos(estimateSatoshis, async (utxos) => {
      let issuer = await IssuerDao.getIssuer(genesisId);
      const genesisTx = new bsv.Transaction(issuer.txHex);
      const genesisLockingScript = genesisTx.outputs[0].script;
      const receiverAddress = bsv.Address.fromString(
        address,
        app.get("ftConfig").network == "main" ? "livenet" : "testnet"
      );

      const issuerPrivKey = PrivateKeyMgr.privateKey;
      const issuerPubKey = PrivateKeyMgr.privateKey.publicKey;
      const genesisTxId = issuer.txId;
      const genesisOutputIndex = issuer.outputIndex;
      const utxoPrivateKey = PrivateKeyMgr.privateKey;
      const changedAddress = PrivateKeyMgr.privateKey.toAddress();
      const feeb = app.get("ftConfig").feeb;
      const genesisContractSatoshis = 3000;
      const tokenContractSatoshis = 8000;
      const tokenName = issuer.tokenName;
      const tokenSymbol = issuer.tokenSymbol;
      const decimalNum = issuer.decimalNum;

      const preUtxoTxId = issuer.preTxId;
      const preUtxoOutputIndex = issuer.preOutputIndex;
      const preUtxoTxHex = issuer.preTxHex;
      const spendByTxId = issuer.txId;
      const spendByOutputIndex = issuer.outputIndex;
      const spendByTxHex = issuer.txHex;

      let ft = new FungibleToken();
      //创建genesis合约，用于校验
      let genesisContract = ft.createGenesisContract(
        issuerPubKey,
        tokenName,
        tokenSymbol,
        decimalNum
      );
      //创建token合约
      let tokenContract = ft.createTokenContract(
        genesisTxId,
        genesisOutputIndex,
        genesisLockingScript,
        receiverAddress,
        tokenAmount
      );
      const genesisUtxo = {
        txId: issuer.txId,
        outputIndex: issuer.outputIndex,
        satoshis: 3000,
      };
      //创建token：解锁genesis，产出新的genesis合约UTXO和token合约UTXO
      let tx = await ft.createTokenTx(
        issuer.preTxId == issuer.genesisTxId,
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
        genesisContractSatoshis,
        tokenContractSatoshis,
        {
          index: preUtxoOutputIndex,
          txId: preUtxoTxId,
          txHex: preUtxoTxHex,
          byTxId: spendByTxId,
          byTxHex: spendByTxHex,
        }
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
      FungibleTokenDao.addUtxos(genesisId, [
        {
          txId: txid,
          satoshis: tokenContractSatoshis,
          outputIndex: 1, //固定在1号位
          rootHeight: 0,
          lockingScript: tx.outputs[1].script.toHex(),
          txHex: tx.serialize(),
          preTxId: spendByTxId,
          preOutputIndex: spendByOutputIndex,
          preTxHex: spendByTxHex,
          tokenAmount: tokenAmount,
        },
      ]);

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
    let issuer = await IssuerDao.getIssuer(genesisId);
    const genesisTx = new bsv.Transaction(issuer.txHex);
    const genesisLockingScript = genesisTx.outputs[0].script;

    const issuerPrivKey = PrivateKeyMgr.privateKey;
    const issuerPubKey = PrivateKeyMgr.privateKey.publicKey;
    const genesisTxId = issuer.txId;
    const genesisOutputIndex = issuer.outputIndex;
    const utxoPrivateKey = PrivateKeyMgr.privateKey; //new bsv.PrivateKey.fromWIF(senderWif);
    const changedAddress = PrivateKeyMgr.privateKey.toAddress();
    const feeb = app.get("ftConfig").feeb;
    const genesisContractSatoshis = 3000;
    const tokenContractSatoshis = 8000;
    const routeCheckContractSatoshis = 8000;
    const tokenName = issuer.tokenName;
    const tokenSymbol = issuer.tokenSymbol;
    const decimalNum = issuer.decimalNum;

    const preUtxoTxId = issuer.preTxId;
    const preUtxoOutputIndex = issuer.preOutputIndex;
    const preUtxoTxHex = issuer.preTxHex;
    const spendByTxId = issuer.txId;
    const spendByOutputIndex = issuer.outputIndex;
    const spendByTxHex = issuer.txHex;

    let ft = new FungibleToken();

    let tokenOutputArray = receivers.map((v) => ({
      address: bsv.Address.fromString(
        v.address,
        app.get("ftConfig").network == "main" ? "livenet" : "testnet"
      ),
      tokenAmount: v.amount,
      satoshis: tokenContractSatoshis,
    }));
    let ftUtxos;
    let estimateSatoshis = app.get("ftConfig").feeb * 8000 + 4000;
    let routeCheckContract;
    //
    /**
     * 先创建用于检查token数量的合约
     * 应该准备三份CheckRoute合约
     * 3输入3输出
     * 3输入20输出
     * 20输入3输出
     * 根据输入和输出的数量动态选择
     * 这里还没实现！！！
     */
    let routeCheckTx = await UtxoMgr.tryUseUtxos(
      estimateSatoshis,
      async (utxos) => {
        ftUtxos = await FungibleTokenDao.getUtxos(genesisId);
        //创建检查token数量的RouteCheck合约
        routeCheckContract = ft.createRouteCheckContract(
          tokenOutputArray,
          Buffer.from(issuer.genesisId),
          TokenProto.getContractCodeHash(Buffer.from(ftUtxos[0].lockingScript))
        );
        //创建交易并广播
        let routeCheckTx = ft.createRouteCheckTx(
          utxoPrivateKey,
          utxos,
          changedAddress,
          feeb,
          routeCheckContract.lockingScript,
          routeCheckContractSatoshis
        );
        // throw "SUCCESS1";
        let txid = await ScriptHelper.sendTx(routeCheckTx);
        return routeCheckTx;
      }
    );

    //拿到上面一笔检查合约后才可以进行接下来的token转移
    estimateSatoshis = app.get("ftConfig").feeb * 8000 * 3;
    return await UtxoMgr.tryUseUtxos(estimateSatoshis, async (utxos) => {
      //此次转移要用到的token合约utxo
      const tokenInputArray = ftUtxos.map((v) => ({
        lockingScript: v.lockingScript,
        satoshis: v.satoshis,
        txId: v.txId,
        outputIndex: v.outputIndex,
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

      let dummyInfo;
      for (let i = 0; i < ftUtxos.length; i++) {
        let v = ftUtxos[i];
        //对于每个token合约utxo，都需要两组不同签名器，但这里只用了同一组，后续还需要修改
        let sigInfo = await ScriptHelper.satoTxSigUTXOSpendBy({
          txId: v.preTxId,
          index: v.preOutputIndex,
          txHex: v.preTxHex,
          byTxId: v.txId,
          byTxHex: v.txHex,
        });
        dummyInfo = sigInfo;
        checkRabinMsgArray = Buffer.concat([
          checkRabinMsgArray,
          Buffer.from(sigInfo.payload),
        ]);

        for (let j = 0; j < 2; j++) {
          const sigBuf = toBufferLE(sigInfo.sigBE, TokenUtil.RABIN_SIG_LEN);
          checkRabinSigArray = Buffer.concat([checkRabinSigArray, sigBuf]);
          const paddingCountBuf = Buffer.alloc(4, 0);
          paddingCountBuf.writeUInt16LE(sigInfo.padding);
          checkRabinPaddingArray = Buffer.concat([
            checkRabinPaddingArray,
            paddingCountBuf,
          ]);
        }
      }

      //解锁token合约UTXO时，需要进行合法性校验，以下是校验数据
      const tokenRabinMsg = dummyInfo.payload;
      const tokenRabinSigArray = [
        BigInt("0x" + dummyInfo.sigBE),
        BigInt("0x" + dummyInfo.sigBE),
      ];
      const tokenRabinPaddingArray = [
        new Bytes(dummyInfo.padding),
        new Bytes(dummyInfo.padding),
      ];
      const prevPrevTokenAddress = utxoPrivateKey.toAddress();
      const prevPrevTokenAmount = 0;

      let rabinPubKeyIndexArray = [0, 1];

      //创建token合约
      let tokenContract = ft.createTokenContract(
        genesisTxId,
        genesisOutputIndex,
        genesisLockingScript
      );
      //创建tx
      let tx = await ft.createUnlockTokenTx(
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
        tokenRabinMsg,
        tokenRabinPaddingArray,
        tokenRabinSigArray,
        prevPrevTokenAddress,
        prevPrevTokenAmount,
        tokenContract,
        routeCheckContract,
        feeb
      );

      let txid = await ScriptHelper.sendTx(tx);
      //db更新token合约UTXO的信息
      receivers.forEach((v, index) => {
        FungibleTokenDao.addUtxos(genesisId, [
          {
            txId: txid,
            satoshis: tokenContractSatoshis,
            outputIndex: index,
            rootHeight: 0,
            lockingScript: tx.outputs[index].script.toHex(),
            tokenAmount: v.tokenAmount,
            txHex: tx.serialize(),
            preTxId: "",
            preOutputIndex: 0,
            preTxHex: "",
          },
        ]);
      });

      ftUtxos.forEach((v) => {
        FungibleTokenDao.removeUtxo(
          utxoPrivateKey.toAddress().toString(),
          v.txId,
          v.outputIndex
        );
      });

      return {
        txId: txid,
      };
    });
  }
}

module.exports = {
  FtMgr,
};
