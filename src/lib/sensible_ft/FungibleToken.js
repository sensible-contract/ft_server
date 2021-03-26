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
const Signature = bsv.crypto.Signature;
const sighashType = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID;
const genesisFlag = Buffer.from("01", "hex");
const nonGenesisFlag = Buffer.from("00", "hex");
const tokenType = Buffer.alloc(4, 0);
tokenType.writeUInt32LE(1);
const PROTO_FLAG = Buffer.from("oraclesv");

const GenesisContractClass = buildContractClass(
  ScriptHelper.loadDesc("tokenGenesis_desc.json")
);
const TokenContractClass = buildContractClass(
  ScriptHelper.loadDesc("token_desc.json")
);
const RouteCheckContractClass = buildContractClass(
  ScriptHelper.loadDesc("tokenRouteCheck_desc.json")
);
const UnlockContractCheckContractClass = buildContractClass(
  ScriptHelper.loadDesc("tokenUnlockContractCheck_desc.json")
);

const genesisTxOutputIndex = 0;
const genesisContractSize = 3840;

const genesisContractSatoshis = 3000;
const tokenContractSatoshis = 3000;

class FungibleToken {
  constructor() {
    //应该准备3组公钥
    // @ts-ignore
    const rabinPubKey = 0x25108ec89eb96b99314619eb5b124f11f00307a833cda48f5ab1865a04d4cfa567095ea4dd47cdf5c7568cd8efa77805197a67943fe965b0a558216011c374aa06a7527b20b0ce9471e399fa752e8c8b72a12527768a9fc7092f1a7057c1a1514b59df4d154df0d5994ff3b386a04d819474efbd99fb10681db58b1bd857f6d5n;

    const rabinPubKey2 = 0x25108ec89eb96b99314619eb5b124f11f00307a833cda48f5ab1865a04d4cfa567095ea4dd47cdf5c7568cd8efa77805197a67943fe965b0a558216011c374aa06a7527b20b0ce9471e399fa752e8c8b72a12527768a9fc7092f1a7057c1a1514b59df4d154df0d5994ff3b386a04d819474efbd99fb10681db58b1bd857f6d5n;
    this.rabinPubKeyArray = [rabinPubKey, rabinPubKey, rabinPubKey];

    //initContractHash
    const routeCheckCode = new RouteCheckContractClass(this.rabinPubKeyArray);
    let code = routeCheckCode.lockingScript.toBuffer();
    const routeCheckCodeHash = new Bytes(
      Buffer.from(bsv.crypto.Hash.sha256ripemd160(code)).toString("hex")
    );
    this.routeCheckCodeHashArray = [
      routeCheckCodeHash,
      routeCheckCodeHash,
      routeCheckCodeHash,
    ];

    const unlockContract = new UnlockContractCheckContractClass(
      this.rabinPubKeyArray
    );
    code = unlockContract.lockingScript.toBuffer();
    const unlockContractCodeHash = new Bytes(
      Buffer.from(bsv.crypto.Hash.sha256ripemd160(code)).toString("hex")
    );
    this.unlockContractCodeHashArray = [
      unlockContractCodeHash,
      unlockContractCodeHash,
      unlockContractCodeHash,
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
  createGenesisContract(issuerPubKey, tokenName, tokenSymbol, decimalNum) {
    const genesisContract = new GenesisContractClass(
      new PubKey(toHex(issuerPubKey)),
      this.rabinPubKeyArray
    );
    const decimalBuf = Buffer.alloc(1, 0);
    decimalBuf.writeUInt8(decimalNum);
    const oracleData = Buffer.concat([
      Buffer.from(tokenName),
      Buffer.from(tokenSymbol),
      genesisFlag,
      decimalBuf,
      Buffer.alloc(20, 0), // address
      Buffer.alloc(8, 0), // token value
      Buffer.alloc(36, 0), // tokenID
      tokenType, // type
      PROTO_FLAG,
    ]);
    genesisContract.setDataPart(oracleData.toString("hex"));
    return genesisContract;
  }

  /**
   * create a tx for genesis
   * @param {bsv.PrivateKey} privateKey the privatekey that utxos belong to
   * @param {Object[]} utxos utxos
   * @param {bsv.Address} changeAddress the change address
   * @param {number} feeb feeb
   * @param {string} genesisScript genesis contract's locking script
   * @param {number} genesisContractSatoshis the genesis contract utxo output satoshis
   */
  createGenesisTx(
    utxoPrivateKey,
    utxos,
    changeAddress,
    feeb,
    genesisScript,
    genesisContractSatoshis
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
        script: genesisScript,
        satoshis: genesisContractSatoshis,
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
   * @param {number} tokenValue the token value want to create
   * @returns
   */
  createTokenContract(
    genesisTxId,
    genesisTxOutputIndex,
    genesisLockingScript,
    receiverAddress,
    tokenValue
  ) {
    const scriptBuffer = genesisLockingScript.toBuffer();
    const tokenName = TokenProto.getTokenName(scriptBuffer);
    const tokenSymbol = TokenProto.getTokenSymbol(scriptBuffer);
    const decimalNum = TokenProto.getDecimalNum(scriptBuffer);
    const indexBuf = Buffer.alloc(4, 0);
    indexBuf.writeUInt32LE(genesisTxOutputIndex);
    let tokenID = TokenProto.getTokenID(scriptBuffer);
    let isFirstGenesis = false;
    let genesisHash;
    if (tokenID.compare(Buffer.alloc(36, 0)) === 0) {
      isFirstGenesis = true;
      tokenID = Buffer.concat([
        Buffer.from(genesisTxId, "hex").reverse(),
        indexBuf,
      ]);
      const newScriptBuf = TokenProto.getNewGenesisScript(
        scriptBuffer,
        tokenID
      );
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
      const decimalBuf = Buffer.alloc(1, 0);
      decimalBuf.writeUInt8(decimalNum);
      const buffValue = Buffer.alloc(8, 0);
      buffValue.writeBigUInt64LE(BigInt(tokenValue));
      const oracleData = Buffer.concat([
        tokenName,
        tokenSymbol,
        nonGenesisFlag, // genesis flag
        decimalBuf,
        receiverAddress.hashBuffer, // address
        buffValue, // token value
        tokenID, // script code hash
        tokenType, // type
        PROTO_FLAG,
      ]);
      tokenContract.setDataPart(oracleData.toString("hex"));
    }

    return tokenContract;
  }

  async createTokenTx(
    isFromOrigin,
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
    genesisContractSatoshis,
    tokenContractSatoshis,
    satotxData
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

    const tokenID = TokenProto.getTokenID(
      tokenContract.lockingScript.toBuffer()
    );
    let newGenesislockingScript = bsv.Script.fromBuffer(
      TokenProto.getNewGenesisScript(genesisLockingScript.toBuffer(), tokenID)
    );
    tx.addOutput(
      new bsv.Transaction.Output({
        script: newGenesislockingScript,
        satoshis: genesisContractSatoshis,
      })
    );

    let tokenLockingScript = tokenContract.lockingScript;
    tx.addOutput(
      new bsv.Transaction.Output({
        script: tokenLockingScript,
        satoshis: tokenContractSatoshis,
      })
    );

    tx.change(changeAddress);
    tx.fee(Math.ceil((tx._estimateSize() + genesisContractSize) * feeb));

    const changeSatoshis = tx.outputs[tx.outputs.length - 1].satoshis;

    const preimage = getPreimage(
      tx,
      genesisLockingScript.toASM(),
      genesisContractSatoshis,
      genesisTxOutputIndex,
      sighashType
    );

    let sig = signTx(
      tx,
      issuerPrivKey,
      genesisLockingScript.toASM(),
      genesisContractSatoshis,
      genesisTxOutputIndex,
      sighashType
    );

    let rabinMsg, rabinPaddingArray, rabinSigArray, rabinPubKeyIndexArray;
    if (isFromOrigin) {
      //如果是第一次生成的genesis合约，则不需要验证
      rabinMsg = Buffer.alloc(1, 0);
      rabinPaddingArray = [new Bytes("00"), new Bytes("00")];
      rabinSigArray = [0, 0];
      rabinPubKeyIndexArray = [0, 1];
    } else {
      let sigInfo = await ScriptHelper.satoTxSigUTXOSpendBy(satotxData);
      rabinMsg = sigInfo.payload;
      rabinPaddingArray = [
        new Bytes(sigInfo.padding),
        new Bytes(sigInfo.padding),
      ];
      rabinSigArray = [
        BigInt("0x" + sigInfo.sigBE),
        BigInt("0x" + sigInfo.sigBE),
      ];
      rabinPubKeyIndexArray = [0, 1];
    }
    // TODO: get genesis from the script code
    const issuerPubKey = issuerPrivKey.publicKey;
    const contractObj = genesisContract.unlock(
      new SigHashPreimage(toHex(preimage)),
      new Sig(toHex(sig)),
      new Bytes(rabinMsg.toString("hex")),
      rabinPaddingArray,
      rabinSigArray,
      rabinPubKeyIndexArray,
      genesisContractSatoshis, //如果设为0，那么就不允许增发了。当然前面也不能加output
      new Bytes(tokenLockingScript.toHex()),
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

  createRouteCheckContract(tokenOutputArray, tokenID, tokenCodeHash) {
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
    const routeCheckContract = new RouteCheckContractClass(
      this.rabinPubKeyArray
    );
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
    routeCheckContractLockingScript,
    routeCheckContractSatoshis
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
        script: routeCheckContractLockingScript,
        satoshis: routeCheckContractSatoshis,
      })
    );

    tx.change(changeAddress);
    tx.fee(Math.ceil(tx._estimateSize() * feeb));
    tx.sign(utxoPrivateKey);
    return tx;
  }

  createUnlockTokenTx(
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
    tokenRabinMsg,
    tokenRabinPaddingArray,
    tokenRabinSigArray,
    prevPrevTokenAddress,
    prevPrevTokenAmount,
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
      console.log(satoshiInput, "input");
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
      const outputSatoshis = tokenOutput.satoshis;
      const lockingScriptBuf = TokenProto.getNewTokenScript(
        inputTokenScript.toBuffer(),
        address.hashBuffer,
        outputTokenAmount
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

    console.log(changeAddress, "changeAddress");
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

    const sigtype =
      bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
    const scriptInputIndex = tokenInputLen + satoshiInputArray.length;
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
        sigtype
      );

      let sig = signTx(
        tx,
        senderPrivKey,
        tokenScript.toASM(),
        satoshis,
        inIndex,
        sigtype
      );

      const unlockingScript = tokenContract
        .unlock(
          new SigHashPreimage(toHex(preimage)),
          new Bytes(prevouts.toString("hex")),
          new Bytes(tokenRabinMsg.toString("hex")),
          tokenRabinPaddingArray,
          tokenRabinSigArray,
          rabinPubKeyIndexArray,
          scriptInputIndex,
          new Bytes(routeCheckTx.serialize()),
          0,
          tokenOutputLen,
          new Bytes(prevPrevTokenAddress.hashBuffer.toString("hex")),
          prevPrevTokenAmount,
          new PubKey(toHex(senderPrivKey.publicKey)),
          new Sig(toHex(sig)),
          0,
          new Bytes("00"),
          0,
          1
        )
        .toScript();
      tx.inputs[inIndex].setScript(unlockingScript);
      //console.log('token transfer args:', toHex(preimage), toHex(senderPrivKey.publicKey), toHex(sig), tokenInputLen, prevouts.toString('hex'), rabinPubKey, rabinMsgArray.toString('hex'), rabinPaddingArray.toString('hex'), rabinSigArray.toString('hex'), tokenOutputLen, recervierArray.toString('hex'), receiverTokenAmountArray.toString('hex'), outputSatoshiArray.toString('hex'), changeSatoshis, changeAddress.hashBuffer.toString('hex'))
    }

    for (let i = 0; i < satoshiInputArray.length; i++) {
      const privKey = satoshiInputPrivKeyArray[i];
      const outputIndex = satoshiInputArray[i].outputIndex;
      const hashData = bsv.crypto.Hash.sha256ripemd160(
        privKey.publicKey.toBuffer()
      );
      const inputIndex = i + tokenInputLen;
      const sig = tx.inputs[inputIndex].getSignatures(
        tx,
        privKey,
        inputIndex,
        sigtype,
        hashData
      );
      tx.inputs[inputIndex].addSignature(tx, sig[0]);
    }

    let preimage = getPreimage(
      tx,
      routeCheckTx.outputs[0].script.toASM(),
      routeCheckTx.outputs[0].satoshis,
      scriptInputIndex,
      sigtype
    );
    const unlockingScript = routeCheckContract
      .unlock(
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
      )
      .toScript();
    tx.inputs[scriptInputIndex].setScript(unlockingScript);
    //console.log('token check contract args:', toHex(preimage), tokenInputLen, tokenInputArray[0].lockingScript.toBuffer().toString('hex'), prevouts.toString('hex'), checkRabinMsgArray.toString('hex'), checkRabinPaddingArray.toString('hex'), checkRabinSigArray.toString('hex'), inputTokenAddressArray.toString('hex'), inputTokenAmountArray.toString('hex'), outputSatoshiArray.toString('hex'), changeSatoshis, changeAddress.hashBuffer.toString('hex'))

    //console.log('createTokenTransferTx: ', tx.serialize())
    return tx;
  }
}

module.exports = {
  FungibleToken,
  sighashType,
};
