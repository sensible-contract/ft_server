// @ts-nocheck
const {
  bsv,
  buildContractClass,
  Bytes,
  getPreimage,
  num2bin,
  PubKey,
  Ripemd160,
  Sha256,
  Sig,
  SigHashPreimage,
  signTx,
  toHex,
} = require("scryptlib");

const {
  DataLen4,
  dummyTxId,
  ScriptHelper,
} = require("../sensible_nft/ScriptHelper");
const TokenProto = require("./tokenProto");
const TokenUtil = require("./tokenUtil");
const Proto = require("./protoheader");
const Signature = bsv.crypto.Signature;
const sighashType = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID;
const genesisFlag = 1;
const nonGenesisFlag = 0;
const tokenType = 1;
const genesisTokenIDTxid =
  "0000000000000000000000000000000000000000000000000000000000000000";
const GenesisContractClass = buildContractClass(
  ScriptHelper.loadDesc("tokenGenesis_desc.json")
);
const TokenContractClass = buildContractClass(
  ScriptHelper.loadDesc("token_desc.json")
);

const RouteCheckContractClass_3To3 = buildContractClass(
  ScriptHelper.loadDesc("tokenRouteCheck_desc.json")
);

const RouteCheckContractClass_6To6 = buildContractClass(
  ScriptHelper.loadDesc("tokenRouteCheck_6To6_desc.json")
);

const RouteCheckContractClass_10To10 = buildContractClass(
  ScriptHelper.loadDesc("tokenRouteCheck_10To10_desc.json")
);

const RouteCheckContractClass_3To100 = buildContractClass(
  ScriptHelper.loadDesc("tokenRouteCheck_3To100_desc.json")
);

const RouteCheckContractClass_20To3 = buildContractClass(
  ScriptHelper.loadDesc("tokenRouteCheck_20To3_desc.json")
);

const UnlockContractCheckContractClass_3To5 = buildContractClass(
  ScriptHelper.loadDesc("tokenUnlockContractCheck_desc.json")
);

const UnlockContractCheckContractClass_6To6 = buildContractClass(
  ScriptHelper.loadDesc("tokenUnlockContractCheck_6To6_desc.json")
);

const UnlockContractCheckContractClass_10To10 = buildContractClass(
  ScriptHelper.loadDesc("tokenUnlockContractCheck_10To10_desc.json")
);

const UnlockContractCheckContractClass_3To100 = buildContractClass(
  ScriptHelper.loadDesc("tokenUnlockContractCheck_3To100_desc.json")
);

const UnlockContractCheckContractClass_20To3 = buildContractClass(
  ScriptHelper.loadDesc("tokenUnlockContractCheck_20To3_desc.json")
);

const ROUTE_CHECK_TYPE_3To3 = 0;
const ROUTE_CHECK_TYPE_6To6 = 1;
const ROUTE_CHECK_TYPE_10To10 = 2;
const ROUTE_CHECK_TYPE_3To100 = 3;
const ROUTE_CHECK_TYPE_20To3 = 4;

const genesisContractSize = 3840;

class FungibleToken {
  constructor(rabinPubKey1, rabinPubKey2, rabinPubKey3) {
    this.rabinPubKeyArray = [rabinPubKey1, rabinPubKey2, rabinPubKey3];

    this.routeCheckCodeHashArray = [
      new Bytes(
        Buffer.from(
          bsv.crypto.Hash.sha256ripemd160(
            new RouteCheckContractClass_3To3(
              this.rabinPubKeyArray
            ).lockingScript.toBuffer()
          )
        ).toString("hex")
      ),
      new Bytes(
        Buffer.from(
          bsv.crypto.Hash.sha256ripemd160(
            new RouteCheckContractClass_6To6(
              this.rabinPubKeyArray
            ).lockingScript.toBuffer()
          )
        ).toString("hex")
      ),
      new Bytes(
        Buffer.from(
          bsv.crypto.Hash.sha256ripemd160(
            new RouteCheckContractClass_10To10(
              this.rabinPubKeyArray
            ).lockingScript.toBuffer()
          )
        ).toString("hex")
      ),
      new Bytes(
        Buffer.from(
          bsv.crypto.Hash.sha256ripemd160(
            new RouteCheckContractClass_3To100(
              this.rabinPubKeyArray
            ).lockingScript.toBuffer()
          )
        ).toString("hex")
      ),
      new Bytes(
        Buffer.from(
          bsv.crypto.Hash.sha256ripemd160(
            new RouteCheckContractClass_20To3(
              this.rabinPubKeyArray
            ).lockingScript.toBuffer()
          )
        ).toString("hex")
      ),
    ];

    this.unlockContractCodeHashArray = [
      new Bytes(
        Buffer.from(
          bsv.crypto.Hash.sha256ripemd160(
            new UnlockContractCheckContractClass_3To5(
              this.rabinPubKeyArray
            ).lockingScript.toBuffer()
          )
        ).toString("hex")
      ),
      new Bytes(
        Buffer.from(
          bsv.crypto.Hash.sha256ripemd160(
            new UnlockContractCheckContractClass_6To6(
              this.rabinPubKeyArray
            ).lockingScript.toBuffer()
          )
        ).toString("hex")
      ),
      new Bytes(
        Buffer.from(
          bsv.crypto.Hash.sha256ripemd160(
            new UnlockContractCheckContractClass_10To10(
              this.rabinPubKeyArray
            ).lockingScript.toBuffer()
          )
        ).toString("hex")
      ),
      new Bytes(
        Buffer.from(
          bsv.crypto.Hash.sha256ripemd160(
            new UnlockContractCheckContractClass_3To100(
              this.rabinPubKeyArray
            ).lockingScript.toBuffer()
          )
        ).toString("hex")
      ),
      new Bytes(
        Buffer.from(
          bsv.crypto.Hash.sha256ripemd160(
            new UnlockContractCheckContractClass_20To3(
              this.rabinPubKeyArray
            ).lockingScript.toBuffer()
          )
        ).toString("hex")
      ),
    ];
  }

  /**
   * create genesis contract
   * @param {Object} issuerPubKey issuer public key used to unlocking genesis contract
   * @param {string} tokenName the token name
   * @param {string} tokenSymbol the token symbol
   * @param {number} decimalNum the token amount decimal number
   * @returns
   */
  createGenesisContract(
    issuerPubKey,
    { tokenName, tokenSymbol, decimalNum } = {}
  ) {
    const genesisContract = new GenesisContractClass(
      new PubKey(toHex(issuerPubKey)),
      this.rabinPubKeyArray
    );
    if (tokenName) {
      const oracleData = TokenProto.newOracleData({
        tokenName,
        tokenSymbol,
        genesisFlag,
        decimalNum,
        tokenType,
      });
      genesisContract.setDataPart(oracleData.toString("hex"));
    }

    return genesisContract;
  }

  /**
   * create a tx for genesis
   * @param {bsv.PrivateKey} privateKey the privatekey that utxos belong to
   * @param {Object[]} utxos utxos
   * @param {bsv.Address} changeAddress the change address
   * @param {number} feeb feeb
   * @param {string} genesisScript genesis contract's locking scriptsatoshis
   */
  createGenesisTx(utxoPrivateKey, utxos, changeAddress, feeb, genesisContract) {
    const tx = new bsv.Transaction().from(
      utxos.map((utxo) => ({
        txId: utxo.txId,
        outputIndex: utxo.outputIndex,
        satoshis: utxo.satoshis,
        script: bsv.Script.buildPublicKeyHashOut(
          utxoPrivateKey.toAddress()
        ).toHex(),
      }))
    );
    tx.addOutput(
      new bsv.Transaction.Output({
        script: genesisContract.lockingScript,
        satoshis: ScriptHelper.getDustThreshold(
          genesisContract.lockingScript.toBuffer().length
        ),
      })
    );

    tx.change(changeAddress);
    tx.fee(Math.ceil(tx._estimateSize() * feeb));
    tx.sign(utxoPrivateKey);
    return tx;
  }

  /**
   * create token contract from genesis contract utxo
   * @param {string} genesisTxId the genesis txid
   * @param {number} genesisTxOutputIndex the genesis utxo output index
   * @param {bsv.Script} genesisScript the genesis contract's locking script
   * @param {bsv.Address} receiverAddress receiver's address
   * @param {BigInt} tokenAmount the token amount want to create
   * @returns
   */
  createTokenContract(
    toSpentGenesisTxId,
    toSpentGenesisTxOutputIndex,
    genesisContract,
    { receiverAddress, tokenAmount } = {}
  ) {
    const scriptBuffer = genesisContract.lockingScript.toBuffer();
    const oracleDataObj = TokenProto.parseOracleData(scriptBuffer);

    let genesisHash;
    if (oracleDataObj.tokenID.txid == genesisTokenIDTxid) {
      oracleDataObj.tokenID = {
        txid: toSpentGenesisTxId,
        index: toSpentGenesisTxOutputIndex,
      };
      const newScriptBuf = TokenProto.updateScript(scriptBuffer, oracleDataObj);
      genesisHash = bsv.crypto.Hash.sha256ripemd160(newScriptBuf);
    } else {
      genesisHash = bsv.crypto.Hash.sha256ripemd160(scriptBuffer);
    }

    const tokenContract = new TokenContractClass(
      this.rabinPubKeyArray,
      this.routeCheckCodeHashArray,
      this.unlockContractCodeHashArray,
      new Bytes(genesisHash.toString("hex"))
    );
    if (receiverAddress) {
      oracleDataObj.genesisFlag = nonGenesisFlag;
      oracleDataObj.tokenAddress = toHex(receiverAddress.hashBuffer);
      oracleDataObj.tokenAmount = tokenAmount;
      const oracleData = TokenProto.newOracleData(oracleDataObj);
      tokenContract.setDataPart(oracleData.toString("hex"));
    }

    return tokenContract;
  }

  async createIssueTx(
    genesisContract,
    issuerPrivKey,
    genesisTxOutputIndex,
    genesisLockingScript,
    genesisUtxo,
    utxoPrivateKey,
    utxos,
    changeAddress,
    feeb,
    tokenContract,
    allowIssueInAddition,
    satotxData,
    oracleSelecteds
  ) {
    utxos = [genesisUtxo].concat(utxos);
    const tx = new bsv.Transaction().from(
      utxos.map((utxo, index) => ({
        txId: utxo.txId,
        outputIndex: utxo.outputIndex,
        satoshis: utxo.satoshis,
        script:
          index == 0
            ? genesisLockingScript
            : bsv.Script.buildPublicKeyHashOut(
                utxoPrivateKey.toAddress()
              ).toHex(),
      }))
    );

    const tokenOracleDataObj = TokenProto.parseOracleData(
      tokenContract.lockingScript.toBuffer()
    );
    const genesisOracleDataObj = TokenProto.parseOracleData(
      genesisContract.lockingScript.toBuffer()
    );

    const isFirstGenesis =
      genesisOracleDataObj.tokenID.txid == genesisTokenIDTxid;

    let genesisContractSatoshis = 0;
    if (allowIssueInAddition) {
      genesisOracleDataObj.tokenID = tokenOracleDataObj.tokenID;
      let newGenesislockingScript = bsv.Script.fromBuffer(
        TokenProto.updateScript(
          genesisLockingScript.toBuffer(),
          genesisOracleDataObj
        )
      );
      genesisContractSatoshis = ScriptHelper.getDustThreshold(
        newGenesislockingScript.toBuffer().length
      );
      tx.addOutput(
        new bsv.Transaction.Output({
          script: newGenesislockingScript,
          satoshis: genesisContractSatoshis,
        })
      );
    }

    const tokenContractSatoshis = ScriptHelper.getDustThreshold(
      tokenContract.lockingScript.toBuffer().length
    );

    tx.addOutput(
      new bsv.Transaction.Output({
        script: tokenContract.lockingScript,
        satoshis: tokenContractSatoshis,
      })
    );

    tx.change(changeAddress);
    tx.fee(Math.ceil((tx._estimateSize() + 4300) * feeb));
    const changeSatoshis = tx.outputs[tx.outputs.length - 1].satoshis;

    const preimage = getPreimage(
      tx,
      genesisLockingScript.toASM(),
      ScriptHelper.getDustThreshold(genesisLockingScript.toBuffer().length),
      genesisTxOutputIndex,
      sighashType
    );

    let sig = signTx(
      tx,
      issuerPrivKey,
      genesisLockingScript.toASM(),
      ScriptHelper.getDustThreshold(genesisLockingScript.toBuffer().length),
      genesisTxOutputIndex,
      sighashType
    );

    let rabinMsg;
    let rabinPaddingArray = [];
    let rabinSigArray = [];
    let rabinPubKeyIndexArray = [];
    if (isFirstGenesis) {
      rabinMsg = Buffer.alloc(1, 0);
      rabinPaddingArray = [new Bytes("00"), new Bytes("00")];
      rabinSigArray = [0, 0];
      rabinPubKeyIndexArray = [0, 1];
    } else {
      for (let i = 0; i < 2; i++) {
        const signerIndex = oracleSelecteds[i];
        let sigInfo = await ScriptHelper.signers[
          signerIndex
        ].satoTxSigUTXOSpendBy(satotxData);
        rabinMsg = sigInfo.payload;
        rabinPaddingArray.push(new Bytes(sigInfo.padding));
        rabinSigArray.push(BigInt("0x" + sigInfo.sigBE));
      }

      rabinPubKeyIndexArray = oracleSelecteds;
    }
    const contractObj = genesisContract.unlock(
      new SigHashPreimage(toHex(preimage)),
      new Sig(toHex(sig)),
      new Bytes(rabinMsg.toString("hex")),
      rabinPaddingArray,
      rabinSigArray,
      rabinPubKeyIndexArray,
      genesisContractSatoshis,
      new Bytes(tokenContract.lockingScript.toHex()),
      tokenContractSatoshis,
      new Ripemd160(changeAddress.hashBuffer.toString("hex")),
      changeSatoshis
    );
    // let ret = contractObj.verify();
    // if (ret.success == false) throw ret;
    // throw "success";
    const unlockingScript = contractObj.toScript();
    tx.inputs[0].setScript(unlockingScript);

    for (let i = 1; i < tx.inputs.length; i++) {
      ScriptHelper.unlockP2PKHInput(utxoPrivateKey, tx, i, sighashType);
    }
    // console.log(tx.serialize());

    return tx;
  }

  createRouteCheckContract(
    routeCheckType,
    tokenOutputArray,
    tokenID,
    tokenCodeHash
  ) {
    const nReceiverBuf = Buffer.alloc(1, 0);
    nReceiverBuf.writeUInt8(tokenOutputArray.length);
    let recervierArray = Buffer.alloc(0, 0);
    let receiverTokenAmountArray = Buffer.alloc(0, 0);
    for (let i = 0; i < tokenOutputArray.length; i++) {
      const item = tokenOutputArray[i];
      recervierArray = Buffer.concat([recervierArray, item.address.hashBuffer]);
      const amountBuf = TokenUtil.getUInt64Buf(item.tokenAmount);
      receiverTokenAmountArray = Buffer.concat([
        receiverTokenAmountArray,
        amountBuf,
      ]);
    }
    let routeCheckContract;
    if (routeCheckType == ROUTE_CHECK_TYPE_3To3) {
      routeCheckContract = new RouteCheckContractClass_3To3(
        this.rabinPubKeyArray
      );
    } else if (routeCheckType == ROUTE_CHECK_TYPE_6To6) {
      routeCheckContract = new RouteCheckContractClass_6To6(
        this.rabinPubKeyArray
      );
    } else if (routeCheckType == ROUTE_CHECK_TYPE_10To10) {
      routeCheckContract = new RouteCheckContractClass_10To10(
        this.rabinPubKeyArray
      );
    } else if (routeCheckType == ROUTE_CHECK_TYPE_3To100) {
      routeCheckContract = new RouteCheckContractClass_3To100(
        this.rabinPubKeyArray
      );
    } else if (routeCheckType == ROUTE_CHECK_TYPE_20To3) {
      routeCheckContract = new RouteCheckContractClass_20To3(
        this.rabinPubKeyArray
      );
    }

    const data = Buffer.concat([
      receiverTokenAmountArray,
      recervierArray,
      nReceiverBuf,
      tokenCodeHash,
      tokenID,
    ]);
    routeCheckContract.setDataPart(data.toString("hex"));
    return routeCheckContract;
  }

  createRouteCheckTx(
    utxoPrivateKey,
    utxos,
    changeAddress,
    feeb,
    routeCheckContract
  ) {
    const tx = new bsv.Transaction().from(
      utxos.map((utxo) => ({
        txId: utxo.txId,
        outputIndex: utxo.outputIndex,
        satoshis: utxo.satoshis,
        script: bsv.Script.buildPublicKeyHashOut(
          utxoPrivateKey.toAddress()
        ).toHex(),
      }))
    );

    tx.addOutput(
      new bsv.Transaction.Output({
        script: routeCheckContract.lockingScript,
        satoshis: ScriptHelper.getDustThreshold(
          routeCheckContract.lockingScript.toBuffer().length
        ),
      })
    );

    tx.change(changeAddress);
    tx.fee(Math.ceil(tx._estimateSize() * feeb));
    tx.sign(utxoPrivateKey);

    return tx;
  }

  createTransferTx(
    routeCheckTx,
    tokenInputArray,
    satoshiInputArray,
    rabinPubKeyIndexArray,
    checkRabinMsgArray,
    checkRabinPaddingArray,
    checkRabinSigArray,
    senderPrivKeyArray,
    satoshiInputPrivKeyArray,
    tokenOutputArray,
    changeAddress,
    tokenRabinDatas,
    tokenContract,
    routeCheckContract,
    feeb
  ) {
    const tx = new bsv.Transaction();
    let prevouts = Buffer.alloc(0);
    const tokenInputLen = tokenInputArray.length;
    let inputTokenScript;
    let inputTokenAmountArray = Buffer.alloc(0);
    let inputTokenAddressArray = Buffer.alloc(0);
    for (let i = 0; i < tokenInputLen; i++) {
      const tokenInput = tokenInputArray[i];
      const tokenScript = bsv.Script.fromBuffer(
        Buffer.from(tokenInput.lockingScript, "hex")
      );
      inputTokenScript = tokenScript;
      const tokenScriptBuf = tokenScript.toBuffer();
      const inputSatoshis = tokenInput.satoshis;
      const txId = tokenInput.txId;
      const outputIndex = tokenInput.outputIndex;
      // token contract input
      tx.addInput(
        new bsv.Transaction.Input({
          output: new bsv.Transaction.Output({
            script: tokenScript,
            satoshis: inputSatoshis,
          }),
          prevTxId: txId,
          outputIndex: outputIndex,
          script: bsv.Script.empty(),
        })
      );

      inputTokenAddressArray = Buffer.concat([
        inputTokenAddressArray,
        TokenProto.getTokenAddress(tokenScriptBuf),
      ]);
      const amountBuf = Buffer.alloc(8, 0);
      amountBuf.writeBigUInt64LE(
        BigInt(TokenProto.getTokenAmount(tokenScriptBuf))
      );
      inputTokenAmountArray = Buffer.concat([inputTokenAmountArray, amountBuf]);

      // add outputpoint to prevouts
      const indexBuf = TokenUtil.getUInt32Buf(outputIndex);
      const txidBuf = TokenUtil.getTxIdBuf(txId);

      prevouts = Buffer.concat([prevouts, txidBuf, indexBuf]);
    }

    for (let i = 0; i < satoshiInputArray.length; i++) {
      const satoshiInput = satoshiInputArray[i];
      const lockingScript = bsv.Script.fromBuffer(
        Buffer.from(satoshiInput.lockingScript, "hex")
      );
      const inputSatoshis = satoshiInput.satoshis;
      const txId = satoshiInput.txId;
      const outputIndex = satoshiInput.outputIndex;
      // bsv input to provide fee
      tx.addInput(
        new bsv.Transaction.Input.PublicKeyHash({
          output: new bsv.Transaction.Output({
            script: lockingScript,
            satoshis: inputSatoshis,
          }),
          prevTxId: txId,
          outputIndex: outputIndex,
          script: bsv.Script.empty(),
        })
      );

      // add outputpoint to prevouts
      const indexBuf = Buffer.alloc(4, 0);
      indexBuf.writeUInt32LE(outputIndex);
      const txidBuf = Buffer.from([...Buffer.from(txId, "hex")].reverse());
      prevouts = Buffer.concat([prevouts, txidBuf, indexBuf]);
    }

    // add routeCheckTx
    tx.addInput(
      new bsv.Transaction.Input({
        output: new bsv.Transaction.Output({
          script: routeCheckTx.outputs[0].script,
          satoshis: routeCheckTx.outputs[0].satoshis,
        }),
        prevTxId: routeCheckTx.id,
        outputIndex: 0,
        script: bsv.Script.empty(),
      })
    );
    let indexBuf = Buffer.alloc(4, 0);
    prevouts = Buffer.concat([
      prevouts,
      Buffer.from(routeCheckTx.id, "hex").reverse(),
      indexBuf,
    ]);

    let recervierArray = Buffer.alloc(0);
    let receiverTokenAmountArray = Buffer.alloc(0);
    let outputSatoshiArray = Buffer.alloc(0);
    const tokenOutputLen = tokenOutputArray.length;
    for (let i = 0; i < tokenOutputLen; i++) {
      const tokenOutput = tokenOutputArray[i];
      const address = tokenOutput.address;
      const outputTokenAmount = tokenOutput.tokenAmount;

      const lockingScriptBuf = TokenProto.getNewTokenScript(
        inputTokenScript.toBuffer(),
        address.hashBuffer,
        outputTokenAmount
      );
      const outputSatoshis = ScriptHelper.getDustThreshold(
        lockingScriptBuf.length
      );
      tx.addOutput(
        new bsv.Transaction.Output({
          script: bsv.Script.fromBuffer(lockingScriptBuf),
          satoshis: outputSatoshis,
        })
      );
      //console.log('output script:', lockingScriptBuf.toString('hex'), outputSatoshis)
      recervierArray = Buffer.concat([recervierArray, address.hashBuffer]);
      const tokenBuf = Buffer.alloc(8, 0);
      tokenBuf.writeBigUInt64LE(BigInt(outputTokenAmount));
      receiverTokenAmountArray = Buffer.concat([
        receiverTokenAmountArray,
        tokenBuf,
      ]);
      const satoshiBuf = Buffer.alloc(8, 0);
      satoshiBuf.writeBigUInt64LE(BigInt(outputSatoshis));
      outputSatoshiArray = Buffer.concat([outputSatoshiArray, satoshiBuf]);
    }

    tx.change(changeAddress);
    tx.fee(
      Math.ceil(
        (tx._estimateSize() +
          genesisContractSize *
            (inputTokenAmountArray.length + tokenOutputArray.length)) *
          feeb
      )
    );
    const changeSatoshis = tx.outputs[tx.outputs.length - 1].satoshis;

    const routeCheckInputIndex = tokenInputLen + satoshiInputArray.length;
    for (let i = 0; i < tokenInputLen; i++) {
      const senderPrivKey = senderPrivKeyArray[i];
      const tokenInput = tokenInputArray[i];
      const tokenScript = bsv.Script.fromBuffer(
        Buffer.from(tokenInput.lockingScript, "hex")
      );
      const satoshis = tokenInput.satoshis;
      const inIndex = i;
      const preimage = getPreimage(
        tx,
        tokenScript.toASM(),
        satoshis,
        inIndex,
        sighashType
      );

      let sig = signTx(
        tx,
        senderPrivKey,
        tokenScript.toASM(),
        satoshis,
        inIndex,
        sighashType
      );

      let tokenRanbinData = tokenRabinDatas[i];
      const unlockingContract = tokenContract.unlock(
        new SigHashPreimage(toHex(preimage)),
        new Bytes(prevouts.toString("hex")),
        new Bytes(tokenRanbinData.tokenRabinMsg.toString("hex")),
        tokenRanbinData.tokenRabinPaddingArray,
        tokenRanbinData.tokenRabinSigArray,
        rabinPubKeyIndexArray,
        routeCheckInputIndex,
        new Bytes(routeCheckTx.serialize()),
        0,
        tokenOutputLen,
        new Bytes(tokenInput.preTokenAddress.hashBuffer.toString("hex")),
        tokenInput.preTokenAmount,
        new PubKey(toHex(senderPrivKey.publicKey)),
        new Sig(toHex(sig)),
        0,
        new Bytes("00"),
        0,
        1
      );
      // let ret = unlockingContract.verify();
      // if (ret.success == false) throw ret;
      // throw "success";
      tx.inputs[inIndex].setScript(unlockingContract.toScript());
      //console.log('token transfer args:', toHex(preimage), toHex(senderPrivKey.publicKey), toHex(sig), tokenInputLen, prevouts.toString('hex'), rabinPubKey, rabinMsgArray.toString('hex'), rabinPaddingArray.toString('hex'), rabinSigArray.toString('hex'), tokenOutputLen, recervierArray.toString('hex'), receiverTokenAmountArray.toString('hex'), outputSatoshiArray.toString('hex'), changeSatoshis, changeAddress.hashBuffer.toString('hex'))
    }

    for (let i = 0; i < satoshiInputArray.length; i++) {
      const privKey = satoshiInputPrivKeyArray[i];
      const hashData = bsv.crypto.Hash.sha256ripemd160(
        privKey.publicKey.toBuffer()
      );
      const inputIndex = i + tokenInputLen;
      const sig = tx.inputs[inputIndex].getSignatures(
        tx,
        privKey,
        inputIndex,
        sighashType,
        hashData
      );
      tx.inputs[inputIndex].addSignature(tx, sig[0]);
    }

    let preimage = getPreimage(
      tx,
      routeCheckTx.outputs[0].script.toASM(),
      routeCheckTx.outputs[0].satoshis,
      routeCheckInputIndex,
      sighashType
    );

    const unlockingContract = routeCheckContract.unlock(
      new SigHashPreimage(toHex(preimage)),
      tokenInputLen,
      new Bytes(tokenInputArray[0].lockingScript),
      new Bytes(prevouts.toString("hex")),
      new Bytes(checkRabinMsgArray.toString("hex")),
      new Bytes(checkRabinPaddingArray.toString("hex")),
      new Bytes(checkRabinSigArray.toString("hex")),
      rabinPubKeyIndexArray,
      new Bytes(inputTokenAddressArray.toString("hex")),
      new Bytes(inputTokenAmountArray.toString("hex")),
      new Bytes(outputSatoshiArray.toString("hex")),
      changeSatoshis,
      new Ripemd160(changeAddress.hashBuffer.toString("hex"))
    );
    // let ret = unlockingContract.verify();
    // if (ret.success == false) throw ret;
    // throw "success";
    tx.inputs[routeCheckInputIndex].setScript(unlockingContract.toScript());
    //console.log('token check contract args:', toHex(preimage), tokenInputLen, tokenInputArray[0].lockingScript.toBuffer().toString('hex'), prevouts.toString('hex'), checkRabinMsgArray.toString('hex'), checkRabinPaddingArray.toString('hex'), checkRabinSigArray.toString('hex'), inputTokenAddressArray.toString('hex'), inputTokenAmountArray.toString('hex'), outputSatoshiArray.toString('hex'), changeSatoshis, changeAddress.hashBuffer.toString('hex'))

    //console.log('createTokenTransferTx: ', tx.serialize())
    return tx;
  }
}

module.exports = {
  FungibleToken,
  sighashType,
  ROUTE_CHECK_TYPE_3To3,
  ROUTE_CHECK_TYPE_6To6,
  ROUTE_CHECK_TYPE_10To10,
  ROUTE_CHECK_TYPE_3To100,
  ROUTE_CHECK_TYPE_20To3,
};
