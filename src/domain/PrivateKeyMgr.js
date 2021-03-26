const { bsv } = require("scryptlib");
const { AES } = require("../lib/crypto");
const { app } = require("../app");
class PrivateKeyMgr {
  static init(wif) {
    this.privateKey = new bsv.PrivateKey.fromWIF(wif);
  }
}

module.exports = {
  PrivateKeyMgr,
};
