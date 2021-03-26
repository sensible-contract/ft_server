const { app } = require("../app");
const { ErrCode, Utxo } = require("../const");
const { CodeError } = require("../util/CodeError");

class FungibleTokenDao {
  static getDB() {
    return app.dao.getClient("db_sensible_ft");
  }

  static getUtxos(genesisId) {
    return new Promise((resolve, reject) => {
      this.getDB()
        .collection("ft_utxos_" + genesisId)
        .find({})
        .toArray((err, res) => {
          if (err) {
            reject(new CodeError(ErrCode.EC_DAO_ERROR));
            return;
          }

          resolve(res);
        });
    });
  }

  static addUtxos(genesisId, utxos) {
    return new Promise((resolve, reject) => {
      this.getDB()
        .collection("ft_utxos_" + genesisId)
        .insertMany(utxos, (err, res) => {
          if (err) {
            reject(new CodeError(ErrCode.EC_DAO_ERROR));
            return;
          }
          resolve(res);
        });
    });
  }

  static removeUtxo(genesisId, txId, outputIndex) {
    return new Promise((resolve, reject) => {
      this.getDB()
        .collection("ft_utxos_" + genesisId)
        .deleteOne({ txId, outputIndex }, (err, res) => {
          if (err) {
            reject(new CodeError(ErrCode.EC_DAO_ERROR));
            return;
          }
          resolve(res);
        });
    });
  }

  static updateUtxo(genesisId, txId, outputIndex, utxo) {
    return new Promise((resolve, reject) => {
      this.getDB()
        .collection("ft_utxos_" + genesisId)
        .updateOne({ txId, outputIndex }, { $set: utxo }, (err, res) => {
          if (err) {
            reject(new CodeError(ErrCode.EC_DAO_ERROR));
            return;
          }
          resolve(res);
        });
    });
  }
}

module.exports = {
  FungibleTokenDao,
};
