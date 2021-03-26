const { bsv } = require("scryptlib");
const { app } = require("../app");
const { FungibleTokenDao } = require("../dao/FungibleTokenDao");
const { sighashType } = require("../lib/sensible_nft/NFT");
const { ScriptHelper } = require("../lib/sensible_nft/ScriptHelper");
const { PrivateKeyMgr } = require("./PrivateKeyMgr");

const MIN_FEE = 546;

//只用来管理发行钱包
class FtUtxoMgr {
  static get balance() {
    return this.utxos.reduce((pre, cur) => cur.satoshis + pre, 0);
  }

  static get address() {
    return PrivateKeyMgr.privateKey.toAddress().toString();
  }

  static async loadUtxos() {
    this.utxos = await FungibleTokenDao.getUtxos(this.address);
  }

  /**
   * 返回一个适合进行genesis的UTXO合集
   * @returns {any[]} utxo合集
   */
  static fetchUtxos(tokenValue) {
    this.utxos.sort((a, b) => a.rootHeight - b.rootHeight); //从浅到深
    let sum = 0;
    let utxos = [];
    for (let i = 0; i < this.utxos.length; i++) {
      sum += this.utxos[i].tokenValue;
      if (sum >= tokenValue) {
        utxos = this.utxos.splice(0, i + 1);
        break;
      }
    }
    return utxos;
  }

  static recycleUtxos(utxos) {
    this.utxos = this.utxos.concat(utxos);
  }

  static async tryUseUtxos(estimateSatoshis, sendTxPromise) {
    const utxos = this.fetchUtxos(estimateSatoshis);
    try {
      let _res = await sendTxPromise(utxos);
      utxos.forEach((v) => {
        UtxoDao.removeUtxo(
          PrivateKeyMgr.privateKey.toAddress().toString(),
          v.txId,
          v.outputIndex
        );
      });
      return _res;
    } catch (e) {
      if (e.resData) {
        if (
          e.resData.body &&
          e.resData.body.includes("too-long-mempool-chain")
        ) {
          utxos.forEach((v) => {
            v.rootHeight++;
            UtxoDao.updateUtxo(
              PrivateKeyMgr.privateKey.toAddress().toString(),
              v.txId,
              v.outputIndex,
              v
            );
          });
        }
      }
      UtxoMgr.recycleUtxos(utxos); //不够严谨
      throw e;
    } finally {
      UtxoMgr.adjustUtxos();
    }
  }
}

module.exports = {
  FtUtxoMgr,
};
