const { app } = require("../app");
const { NetMgr } = require("../domain/NetMgr");
const { FtMgr } = require("../domain/FtMgr");
exports.default = function () {
  NetMgr.listen(
    "POST",
    "/api/ft/genesis",
    async function (req, res, params, body) {
      const { tokenName, tokenSymbol, decimalNum } = body;
      return await FtMgr.genesis(tokenName, tokenSymbol, decimalNum);
    }
  );

  NetMgr.listen(
    "POST",
    "/api/ft/issue",
    async function (req, res, params, body) {
      const {
        genesisId,
        tokenAmount,
        receiverAddress,
        allowIssueInAddition,
      } = body;
      return await FtMgr.issue(
        genesisId,
        tokenAmount,
        receiverAddress,
        allowIssueInAddition
      );
    }
  );

  NetMgr.listen(
    "POST",
    "/api/ft/transfer",
    async function (req, res, params, body) {
      const { genesisId, senderWif, receivers } = body;
      return await FtMgr.transfer(genesisId, senderWif, receivers);
    }
  );
};
